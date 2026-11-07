import { randomUUID } from "node:crypto";
import { MercadoPagoConfig, Payment, Preference } from "mercadopago";
import { DESCRICAO_RIFA, TICKET_PRICE_BRL, VALOR_PIX_TESTE_BRL } from "../types/rifa.types.js";
import { formatarDataMP } from "./criarPixDoacao.js";
import { PAGAMENTOS_SO_CARTAO } from "./criarPreferenciaDoacao.js";

function getClient() {
    return new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! });
}

/**
 * Páginas de retorno do cartão de uma compra com reserva. Os números já
 * foram escolhidos, então não voltam para a tela de escolha (/rifa/pagamento-*).
 */
export function backUrlsCompra(frontendUrl: string) {
    return {
        success: `${frontendUrl}/rifa/compra/aprovada`,
        pending: `${frontendUrl}/rifa/compra/pendente`,
        failure: `${frontendUrl}/rifa/compra/recusada`,
    };
}

export interface DadosPagamentoPedido {
    pedidoId: string;
    numeros: number[];
    /** Total do pedido, calculado no servidor (quantidade × bilhete). */
    valor: number;
    /** Mesmo instante no Pix e no link do cartão. */
    expiraEm: Date;
    email: string;
    nome: string;
    origem: { utmSource?: string | null; utmMedium?: string | null };
    teste?: boolean;
}

const pad = (n: number) => String(n).padStart(3, "0");

/**
 * metadata comum: tipo RIFA (o webhook e o painel reconhecem a rifa) e
 * pedido_id (o webhook confirma os números reservados, sem criar o registro
 * do fluxo antigo).
 */
function metadataPedido(dados: DadosPagamentoPedido, rastreioId: string) {
    return {
        tipo: "RIFA",
        rastreio_id: rastreioId,
        pedido_id: dados.pedidoId,
        quantidade: dados.numeros.length,
        numeros: dados.numeros.map(pad).join(","),
        valor_esperado: dados.valor,
        utm_source: dados.origem.utmSource ?? null,
        utm_medium: dados.origem.utmMedium ?? null,
        utm_campaign: "RIFA_SOLIDARIA",
        email_contato: dados.email,
        ...(dados.teste ? { teste: true } : {}),
    };
}

const descricao = (numeros: number[]) =>
    `${DESCRICAO_RIFA} (${numeros.length === 1 ? "nº" : "nºs"} ${numeros.map(pad).join(", ")})`;

// Objeto mutável de propósito: os testes trocam as chamadas reais por fakes
// (tests/support/mercadoPagoFake.ts).
export const mercadoPagoPedidoClient = {
    async criarPix(dados: DadosPagamentoPedido) {
        const rastreioId = randomUUID();
        return new Payment(getClient()).create({
            body: {
                transaction_amount: dados.teste ? VALOR_PIX_TESTE_BRL : dados.valor,
                description: descricao(dados.numeros),
                payment_method_id: "pix",
                payer: { email: dados.email },
                external_reference: rastreioId,
                date_of_expiration: formatarDataMP(dados.expiraEm),
                metadata: metadataPedido(dados, rastreioId),
            },
            requestOptions: { idempotencyKey: rastreioId },
        });
    },

    async criarPreferencia(dados: DadosPagamentoPedido) {
        const FRONTEND_URL = process.env.FRONTEND_URL ?? "";
        const usaAutoReturn = FRONTEND_URL.startsWith("https://");
        const [primeiroNome, ...resto] = dados.nome.split(/\s+/);

        return new Preference(getClient()).create({
            body: {
                items: [
                    {
                        id: "acao-natal-2026",
                        title: DESCRICAO_RIFA,
                        description: descricao(dados.numeros),
                        quantity: dados.numeros.length,
                        unit_price: TICKET_PRICE_BRL,
                        currency_id: "BRL",
                    },
                ],
                payer: {
                    email: dados.email,
                    ...(primeiroNome ? { name: primeiroNome } : {}),
                    ...(resto.length ? { surname: resto.join(" ") } : {}),
                },
                back_urls: backUrlsCompra(FRONTEND_URL),
                // O retorno do cartão traz external_reference: é o pedido.
                external_reference: dados.pedidoId,
                metadata: metadataPedido(dados, dados.pedidoId),
                payment_methods: PAGAMENTOS_SO_CARTAO,
                // O link para de aceitar pagamento no mesmo instante que o Pix venceria.
                expires: true,
                expiration_date_from: formatarDataMP(new Date(Date.now() - 60_000)),
                expiration_date_to: formatarDataMP(dados.expiraEm),
                ...(usaAutoReturn ? { auto_return: "approved" as const } : {}),
                statement_descriptor: "GATIL IRMA FRANCISCA",
            },
            requestOptions: { idempotencyKey: `${dados.pedidoId}-${dados.expiraEm.getTime()}` },
        });
    },

    /** Cancela um Pix ainda pendente (troca de números ou de forma de pagamento). */
    async cancelarPagamento(mpPaymentId: string) {
        return new Payment(getClient()).cancel({ id: mpPaymentId });
    },

    /** Faz o link do cartão parar de aceitar pagamento agora. */
    async expirarPreferencia(preferenceId: string) {
        return new Preference(getClient()).update({
            id: preferenceId,
            // A API aceita atualização parcial; o tipo do SDK pede os itens.
            updatePreferenceRequest: {
                expires: true,
                expiration_date_to: formatarDataMP(new Date()),
            } as Parameters<Preference["update"]>[0]["updatePreferenceRequest"],
        });
    },
};

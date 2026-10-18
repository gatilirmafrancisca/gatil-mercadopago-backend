import * as RifaTypes from "../types/rifa.types.js";
import type { IRifa } from "../models/Rifa.js";
import { buscarPagamento } from "../mercadoPago/buscarPagamento.js";
import { sincronizarPagamentoRifa } from "./rifa.service.js";
import { ConflictError } from "../utils/errors.js";
import { UTM_CAMPAIGN } from "../types/origem.types.js";
import { registrarConversaoDoacao } from "./conversao.service.js";


interface IPayload {

    mercadoPagoId: string;
    valor: number | undefined ;
    status: RifaTypes.StatusRifaType;
    utmSource: string;
    utmMedium: string;
    utmCampaign: string;
    nomeDoador: string;
    dataConfirmacao: string;
    emailDoador?: string;
    descricao?: string;
}

export const mapearStatusMP = (statusMP: string): RifaTypes.StatusRifaType => {
    const mapa: Record<string, RifaTypes.StatusRifaType> = {
        approved: "APROVADO",
        pending: "PENDENTE",
        in_process: "PENDENTE",
        rejected: "CANCELADO",
        cancelled: "CANCELADO",
        refunded: "CANCELADO",
        charged_back: "CANCELADO",
    };
    return mapa[statusMP] ?? "PENDENTE";
}

type Pagamento = Awaited<ReturnType<typeof buscarPagamento>>;

const CAMPANHA_RIFA = UTM_CAMPAIGN[1];

/**
 * Pagamento da rifa: criado pela preferência ou pelo Pix da rifa (tipo
 * "RIFA"), ou por preferências antigas, que não tinham tipo. Nelas o
 * utm_campaign vinha do link (um link com outra campanha tirava a compra
 * da rifa), então a descrição — o título do bilhete, definido pelo
 * servidor — também identifica a rifa.
 */
export const ehPagamentoRifa = (pagamento: Pagamento): boolean =>
    pagamento.metadata?.tipo === "RIFA"
    || pagamento.metadata?.utm_campaign === CAMPANHA_RIFA
    || pagamento.description === RifaTypes.DESCRICAO_RIFA;

export const processarNotificacaoPagamento = async (body: any): Promise<void> => {
    const { type, data } = body ?? {};
    if (type !== "payment" || !data?.id) return;

    try {
        // Nunca confiar no corpo do webhook para status/valor — buscar o
        // dado real na API do Mercado Pago.
        const pagamento = await buscarPagamento(data.id);


        // CENÁRIO DA RIFA SOLIDÁRIA
        if (ehPagamentoRifa(pagamento)) {

            const dadosCriacao: Partial<Omit<IRifa, "paymentId">> = {
                status: mapearStatusMP(pagamento.status!),
                amount: RifaTypes.TICKET_PRICE_BRL,
                ...(pagamento.payer?.email ? { email: pagamento.payer.email } : {}),
            };

            await sincronizarPagamentoRifa(String(pagamento.id), dadosCriacao);
        }

        // CENÁRIO DA DOAÇÃO — conversão para Meta/GA4. Falha aqui não pode
        // impedir o registro financeiro abaixo.
        await registrarConversaoDoacao(pagamento).catch((err) =>
            console.error("[conversao] falha ao reportar doação", data.id, err)
        );

        await sincronizarFinanceiroDoPagamento(pagamento);

    } catch (err) {

        if (err instanceof ConflictError) {
            // Reenvio do MP para um paymentId já registrado — comportamento
            // esperado, não é falha.
            console.info("[webhook mercadopago] pagamento já registrado:", data.id);
            return;
        }

        console.error("[webhook mercadopago] falha ao processar", data.id, err);
    }
};

/**
 * Envia ao painel o estado atual de um pagamento buscado na API do MP.
 * `status` sobrescreve o do MP — ex: Pix vencido que o MP ainda mostra como
 * pendente, mas que o banco já considera CANCELADO.
 */
export async function sincronizarFinanceiroDoPagamento(pagamento: Pagamento, status?: RifaTypes.StatusRifaType) {
    await sincronizarFinanceiro({

        mercadoPagoId: String(pagamento.id),
        // Líquido (já sem a taxa do MP). Enquanto o pagamento está pendente
        // (ex: Pix aguardando) o MP ainda não informa o líquido, e o painel
        // exige um valor: vai o bruto, e a aprovação sobrescreve.
        valor: pagamento.transaction_details?.net_received_amount || pagamento.transaction_amount,
        status: status ?? mapearStatusMP(pagamento.status ?? "pending"),
        utmSource: pagamento.metadata?.utm_source ?? "",
        utmMedium: pagamento.metadata?.utm_medium ?? "",
        // O painel separa a rifa das doações (categoria=DOACAO) por esse campo.
        utmCampaign: ehPagamentoRifa(pagamento) ? CAMPANHA_RIFA : (pagamento.metadata?.utm_campaign ?? ""),
        nomeDoador: pagamento.payer?.first_name ?? "Anônimo",
        // Data do pagamento, não da sincronização: retries do webhook e a
        // consulta do Pix não podem mudar o mês em que a entrada conta.
        dataConfirmacao: pagamento.date_approved ?? pagamento.date_created ?? new Date().toISOString(),
        ...(pagamento.payer?.email
            ? { emailDoador: pagamento.payer.email }
        : {}),
        ...(pagamento.description
        ? { descricao: pagamento.description }
        : {}),
    });
}

export async function sincronizarFinanceiro(payload: IPayload) {

  const PAINEL_ADM_URL = process.env.PAINEL_ADM_URL!;
  const INTERNAL_SECRET = process.env.PAINEL_ADM_INTERNAL_SECRET!;

  const response = await fetch(`${PAINEL_ADM_URL}/financeiro/interno/mercadopago`, {

    method: "POST",
    headers: {

      "Content-Type": "application/json",
      "x-internal-secret": INTERNAL_SECRET,
    },

    body: JSON.stringify({
        ...payload,
        metodoPagamento: "MERCADO_PAGO",
        tipo: "ENTRADA",
    }),

  });

  if (!response.ok) {
        const responseBody = await response.text();
        throw new Error(
            `[financeiroSync] painel respondeu ${response.status}: ${responseBody}`,
        );
  }

    console.info("[financeiroSync] transferência sincronizada", payload.mercadoPagoId);
}
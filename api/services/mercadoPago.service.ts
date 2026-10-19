import * as RifaTypes from "../types/rifa.types.js";
import type { IRifa } from "../models/Rifa.js";
import { buscarPagamento } from "../mercadoPago/buscarPagamento.js";
import { sincronizarPagamentoRifa } from "./rifa.service.js";
import { ConflictError } from "../utils/errors.js";
import { UTM_CAMPAIGN } from "../types/origem.types.js";
import { registrarConversaoDoacao } from "./conversao.service.js";
import { ehEmailValido } from "../utils/rifavalidar.js";


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

/** Pix de teste de R$ 0,01 (ver criarPixRifa.ts). */
export const ehPagamentoTeste = (pagamento: Pagamento): boolean =>
    pagamento.metadata?.teste === true || pagamento.metadata?.teste === "true";

/**
 * E-mail de quem pagou: o do pagador no MP ou, se ele não vier (acontece no
 * Pix e no cartão), o que a pessoa digitou no site (metadata.email_contato).
 */
export const emailDoPagamento = (pagamento: Pagamento): string | null => {
    const candidatos = [pagamento.payer?.email, pagamento.metadata?.email_contato];
    return (candidatos.find((e) => ehEmailValido(e)) as string | undefined)?.trim() ?? null;
};

/** Nome de quem pagou: o do pagador ou o titular do cartão. */
export const nomeDoPagador = (pagamento: Pagamento): string | null => {
    const pagador = [pagamento.payer?.first_name, pagamento.payer?.last_name].filter(Boolean).join(" ").trim();
    const titular = (pagamento as any).card?.cardholder?.name;
    const nome = [pagador, titular].find((n) => typeof n === "string" && n.trim());
    return nome ? String(nome).trim() : null;
};

/**
 * Banco de onde saiu o Pix (ex: "NU PAGAMENTOS S.A."). É a instituição, não a
 * pessoa — o MP não devolve o nome nem o e-mail de quem fez o Pix.
 */
export const bancoDoPagador = (pagamento: Pagamento): string | null => {
    const banco = (pagamento as any).point_of_interaction?.transaction_data?.bank_info?.payer?.long_name;
    return typeof banco === "string" && banco.trim() ? banco.trim() : null;
};

/** pix, cartao, ou o tipo que o MP informar. */
export const metodoDoPagamento = (pagamento: Pagamento): string | null => {
    if (pagamento.payment_method_id === "pix") return "pix";
    if (pagamento.payment_type_id === "credit_card" || pagamento.payment_type_id === "debit_card") return "cartao";
    return pagamento.payment_type_id ?? pagamento.payment_method_id ?? null;
};

/**
 * O que o banco da rifa guarda de um pagamento do MP. O valor é o do
 * bilhete — no Pix de teste, o valor cobrado (R$ 0,01).
 */
export const dadosRifaDoPagamento = (
    pagamento: Pagamento,
    status: RifaTypes.StatusRifaType = mapearStatusMP(pagamento.status ?? "pending"),
): Partial<Omit<IRifa, "paymentId">> => {
    const teste = ehPagamentoTeste(pagamento);
    const email = emailDoPagamento(pagamento);
    const nomePagador = nomeDoPagador(pagamento);
    const bancoPagador = bancoDoPagador(pagamento);
    const metodoPagamento = metodoDoPagamento(pagamento);
    const dataPagamento = pagamento.date_approved ? new Date(pagamento.date_approved) : null;
    return {
        status,
        amount: teste ? (pagamento.transaction_amount ?? 0) : RifaTypes.TICKET_PRICE_BRL,
        // Só true é gravado: ver o índice único em models/Rifa.ts.
        ...(teste ? { teste: true } : {}),
        ...(email ? { email } : {}),
        ...(nomePagador ? { nomePagador } : {}),
        ...(bancoPagador ? { bancoPagador } : {}),
        ...(metodoPagamento ? { metodoPagamento } : {}),
        ...(dataPagamento ? { dataPagamento } : {}),
    };
};

export const processarNotificacaoPagamento = async (body: any): Promise<void> => {
    const { type, data } = body ?? {};
    if (type !== "payment" || !data?.id) return;

    try {
        // Nunca confiar no corpo do webhook para status/valor — buscar o
        // dado real na API do Mercado Pago.
        const pagamento = await buscarPagamento(data.id);


        // CENÁRIO DA RIFA SOLIDÁRIA
        if (ehPagamentoRifa(pagamento)) {
            await sincronizarPagamentoRifa(String(pagamento.id), dadosRifaDoPagamento(pagamento));
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
        ? { descricao: `${ehPagamentoTeste(pagamento) ? "[TESTE] " : ""}${pagamento.description}` }
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
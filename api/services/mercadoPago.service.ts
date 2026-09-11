import * as RifaTypes from "../types/rifa.types.js";
import type { IRifa } from "../models/Rifa.js";
import { buscarPagamento } from "../mercadoPago/buscarPagamento.js";
import { registrarPagamentoRifa } from "./rifa.service.js";
import { ConflictError } from "../utils/errors.js";
import { UTM_CAMPAIGN } from "../types/origem.types.js";


interface IPayload {

    mercadoPagoId: string;
    valor: number | undefined ;
    status: RifaTypes.StatusRifaType;
    utmSource: string;
    utmMedium: string;
    utmCampaign: string;
    nomeDoador: string;
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

export const processarNotificacaoPagamento = async (body: any): Promise<void> => {
    const { type, data } = body ?? {};
    if (type !== "payment" || !data?.id) return;

    try {
        // Nunca confiar no corpo do webhook para status/valor — buscar o
        // dado real na API do Mercado Pago.
        const pagamento = await buscarPagamento(data.id);


        // CENÁRIO DA RIFA SOLIDÁRIA
        if (pagamento.metadata?.utm_campaign == UTM_CAMPAIGN[1]) {

            const dadosCriacao: Partial<Omit<IRifa, "paymentId">> = {
                status: mapearStatusMP(pagamento.status!),
                amount: RifaTypes.TICKET_PRICE_BRL,
                ...(pagamento.payer?.email ? { email: pagamento.payer.email } : {}),
            };

            await registrarPagamentoRifa(String(pagamento.id), dadosCriacao);
        }
        
        await sincronizarFinanceiro({
            
            mercadoPagoId: String(pagamento.id),
            valor: pagamento.transaction_details?.net_received_amount,
            status: mapearStatusMP(pagamento.status ?? "pending"),
            utmSource: pagamento.metadata?.utm_source ?? "",
            utmMedium: pagamento.metadata?.utm_medium ?? "",
            utmCampaign: pagamento.metadata?.utm_campaign ?? "",
            nomeDoador: pagamento.payer?.first_name ?? "Anônimo",
            ...(pagamento.payer?.email
                ? { emailDoador: pagamento.payer.email }
            : {}),
            ...(pagamento.description
            ? { descricao: pagamento.description }
            : {}),
        });

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
        dataConfirmacao: new Date().toISOString(),
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
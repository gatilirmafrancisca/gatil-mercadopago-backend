import { randomUUID } from "node:crypto";
import { MercadoPagoConfig, Payment } from "mercadopago";
import type { UtmMetadata } from "../types/origem.types.js";
import type { RastreioMetadata } from "../types/rastreio.types.js";

/** Tempo que o QR code do Pix fica válido. */
export const PIX_EXPIRACAO_MINUTOS = 30;

function getClient() {
  return new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! });
}

/**
 * Formato que o Mercado Pago pede em date_of_expiration
 * ("yyyy-MM-ddTHH:mm:ss.SSS-03:00"), no horário de Brasília.
 */
export function formatarDataMP(data: Date): string {
  const brasilia = new Date(data.getTime() - 3 * 60 * 60 * 1000);
  return brasilia.toISOString().replace("Z", "-03:00");
}

interface DadosPix {
  valor: number;
  email: string;
  origem: UtmMetadata;
  rastreio: RastreioMetadata;
}

// Objeto mutável de propósito — os testes trocam a chamada real por uma
// fake (ver tests/support/mercadoPagoFake.ts).
export const mercadoPagoPixClient = {
  async criar({ valor, email, origem, rastreio }: DadosPix) {
    // Mesmo esquema da preferência (criarPreferenciaDoacao.ts): gerado aqui,
    // vai no external_reference e no metadata, e o webhook confere os dois
    // antes de reportar a conversão.
    const rastreioId = randomUUID();
    const expiraEm = new Date(Date.now() + PIX_EXPIRACAO_MINUTOS * 60_000);

    return new Payment(getClient()).create({
      body: {
        transaction_amount: valor,
        description: "Doação — Gatil Irmã Francisca",
        payment_method_id: "pix",
        payer: { email },
        external_reference: rastreioId,
        date_of_expiration: formatarDataMP(expiraEm),
        metadata: {
          tipo: "DOACAO",
          rastreio_id: rastreioId,
          valor_esperado: valor,
          utm_source: origem.utmSource ?? null,
          utm_medium: origem.utmMedium ?? null,
          utm_campaign: origem.utmCampaign ?? null,
          ...rastreio,
        },
      },
      // O Mercado Pago exige X-Idempotency-Key ao criar pagamentos.
      requestOptions: { idempotencyKey: rastreioId },
    });
  },
};

import { randomUUID } from "node:crypto";
import { MercadoPagoConfig, Preference } from "mercadopago";
import type { UtmMetadata } from "../types/origem.types.js";
import { normalizarRastreio, type RastreioMetadata } from "../types/rastreio.types.js";

function getClient() {
  return new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! });
}

/**
 * Páginas de retorno do checkout da doação. Ficam sob /doar, separadas das
 * da rifa (/rifa/pagamento-*).
 */
export function backUrlsDoacao(frontendUrl: string) {
  return {
    success: `${frontendUrl}/doar/pagamento-aprovado`,
    pending: `${frontendUrl}/doar/pagamento-pendente`,
    failure: `${frontendUrl}/doar/pagamento-recusado`,
  };
}

export const mercadoPagoDoacaoClient = {
  async criar(
    valor: number,
    origem: UtmMetadata = {},
    rastreio: RastreioMetadata = normalizarRastreio(undefined, undefined, undefined),
  ) {
    const preference = new Preference(getClient());
    const FRONTEND_URL = process.env.FRONTEND_URL ?? "";
    const usaAutoReturn = FRONTEND_URL.startsWith("https://");
    // Gerado aqui (e não no navegador) para não poder ser forjado. Vai no
    // external_reference e no metadata; o webhook confere que os dois batem
    // antes de reportar a conversão, e o Meta usa como event_id.
    const rastreioId = randomUUID();

    return preference.create({
      body: {
        items: [
          {
            id: "doacao-avulsa",
            title: "Doação — Gatil Irmã Francisca",
            quantity: 1,
            unit_price: valor,
            currency_id: "BRL",
          },
        ],
        back_urls: backUrlsDoacao(FRONTEND_URL),


        external_reference: rastreioId,

        metadata: {
          tipo: "DOACAO",
          rastreio_id: rastreioId,
          valor_esperado: valor,
          utm_source: origem.utmSource ?? null,
          utm_medium: origem.utmMedium ?? null,
          utm_campaign: origem.utmCampaign ?? null,
          ...rastreio,
        },

        payment_methods: {
          installments: 2,
          excluded_payment_types: [{ id: "ticket" }],
        },

        ...(usaAutoReturn ? { auto_return: "approved" as const } : {}),
        statement_descriptor: "GATIL IRMA FRANCISCA",
      },
    });
  },
};

export async function criarPreferenciaDoacao(
  valor: number,
  origem: UtmMetadata = {},
  rastreio?: RastreioMetadata
) {
  return mercadoPagoDoacaoClient.criar(valor, origem, rastreio);
}
import { MercadoPagoConfig, Preference } from "mercadopago";
import type { UtmMetadata } from "../types/origem.types.js";

function getClient() {
  return new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! });
}


export const mercadoPagoDoacaoClient = {
  async criar(valor: number, origem: UtmMetadata = {}) {
    const preference = new Preference(getClient());
    const FRONTEND_URL = process.env.FRONTEND_URL ?? "";
    const usaAutoReturn = FRONTEND_URL.startsWith("https://");

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
        back_urls: {
          success: `${FRONTEND_URL}/doacao-confirmada`,
          pending: `${FRONTEND_URL}/doacao-pendente`,
          failure: `${FRONTEND_URL}/doacao-recusada`,
        },


        metadata: {
          utm_source: origem.utmSource ?? null,
          utm_medium: origem.utmMedium ?? null,
          utm_campaign: origem.utmCampaign ?? null,
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
  origem: UtmMetadata = {}
) {
  return mercadoPagoDoacaoClient.criar(valor, origem);
}
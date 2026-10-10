import { MercadoPagoConfig, Preference } from "mercadopago";
import type { UtmMetadata } from "../types/origem.types.js";

function getClient() {
    return new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! });
}

/**
 * Páginas de retorno do checkout da rifa. Ficam sob /rifa para não se
 * misturarem com as da doação (/doar/pagamento-*).
 */
export function backUrlsRifa(frontendUrl: string) {
    return {
        success: `${frontendUrl}/rifa/pagamento-aprovado`,
        pending: `${frontendUrl}/rifa/pagamento-pendente`,
        failure: `${frontendUrl}/rifa/pagamento-recusado`,
    };
}

export const mercadoPagoPreferenceClient = {
    async criar(origem: UtmMetadata = {}) {
        const preference = new Preference(getClient());
        const FRONTEND_URL = process.env.FRONTEND_URL ?? "";
        const usaAutoReturn = FRONTEND_URL.startsWith("https://");

        return preference.create({
            body: {
                items: [
                    {
                        id: "rifa-solidaria-2026",
                        title: "Número da Rifa Solidária — Gatil Irmã Francisca",
                        quantity: 1,
                        unit_price: 100,
                        currency_id: "BRL",
                    },
                ],
                back_urls: backUrlsRifa(FRONTEND_URL),

                metadata: {
                utm_source: origem.utmSource ?? null,
                utm_medium: origem.utmMedium ?? null,
                utm_campaign: origem.utmCampaign ?? "RIFA_SOLIDARIA",
            },

                payment_methods: {
                    installments: 2,

                    excluded_payment_types: [
                    {
                        id: "ticket",
                    },
                ],
                },

                ...(usaAutoReturn ? { auto_return: "approved" as const } : {}),
                statement_descriptor: "GATIL IRMA FRANCISCA",
            },
        });
    },
};

export async function criarPreferenciaRifa(origem: UtmMetadata = {}) {
    return mercadoPagoPreferenceClient.criar(origem);
}
import { randomUUID } from "node:crypto";
import { MercadoPagoConfig, Preference } from "mercadopago";
import type { UtmMetadata } from "../types/origem.types.js";
import { PAGAMENTOS_SO_CARTAO } from "./criarPreferenciaDoacao.js";
import { DESCRICAO_RIFA, TICKET_PRICE_BRL } from "../types/rifa.types.js";

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
        // Código único da compra, exigido pelo Mercado Pago na medição de
        // qualidade (conciliação financeira): liga o payment_id ao nosso
        // registro. Mesmo esquema do Pix da rifa e da doação.
        const rastreioId = randomUUID();

        return preference.create({
            body: {
                items: [
                    {
                        id: "rifa-solidaria-2026",
                        title: DESCRICAO_RIFA,
                        quantity: 1,
                        unit_price: TICKET_PRICE_BRL,
                        currency_id: "BRL",
                    },
                ],
                back_urls: backUrlsRifa(FRONTEND_URL),

                external_reference: rastreioId,

                // tipo + utm_campaign fixos: é por eles que o webhook reconhece a
                // rifa e que o painel separa a rifa das doações. A campanha do
                // link (utm_campaign) não pode sobrescrever isso.
                metadata: {
                    tipo: "RIFA",
                    rastreio_id: rastreioId,
                    utm_source: origem.utmSource ?? null,
                    utm_medium: origem.utmMedium ?? null,
                    utm_campaign: "RIFA_SOLIDARIA",
                },

                payment_methods: PAGAMENTOS_SO_CARTAO,

                ...(usaAutoReturn ? { auto_return: "approved" as const } : {}),
                statement_descriptor: "GATIL IRMA FRANCISCA",
            },
        });
    },
};

export async function criarPreferenciaRifa(origem: UtmMetadata = {}) {
    return mercadoPagoPreferenceClient.criar(origem);
}
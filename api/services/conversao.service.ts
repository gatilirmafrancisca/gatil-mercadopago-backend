// Reporta a doação aprovada ao Meta (Conversions API) e ao GA4 (Measurement
// Protocol). O Pixel não roda no checkout do Mercado Pago, então a conversão
// sai daqui, do webhook, usando os identificadores que o navegador mandou ao
// criar a preferência (ver criarPreferenciaDoacao.ts).
import { createHash } from "node:crypto";
import ConversaoDoacao from "../models/ConversaoDoacao.js";
import type { buscarPagamento } from "../mercadoPago/buscarPagamento.js";

type Pagamento = Awaited<ReturnType<typeof buscarPagamento>>;

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v23.0";
// "Donate" é evento padrão do Meta e pode ser usado para otimizar campanhas.
const META_EVENTO = "Donate";

function sha256(valor: string | null | undefined): string[] | undefined {
    const normalizado = valor?.trim().toLowerCase();
    return normalizado ? [createHash("sha256").update(normalizado).digest("hex")] : undefined;
}

/**
 * Confere que o pagamento é uma doação aprovada, criada pelo nosso backend,
 * e que não foi alterada no caminho. Devolve null se algo não bater.
 */
function validarDoacao(pagamento: Pagamento) {
    const metadata = pagamento.metadata ?? {};

    if (pagamento.status !== "approved") return null;
    if (metadata.tipo !== "DOACAO" || !metadata.rastreio_id) return null;

    if (pagamento.external_reference !== metadata.rastreio_id) {
        console.warn("[conversao] rastreio_id não confere com external_reference", pagamento.id);
        return null;
    }

    const valor = Number(pagamento.transaction_amount);
    if (!(valor > 0) || Number(metadata.valor_esperado) !== valor) {
        console.warn("[conversao] valor pago diferente do valor da preferência", pagamento.id);
        return null;
    }

    return { paymentId: String(pagamento.id), rastreioId: String(metadata.rastreio_id), valor, metadata };
}

async function enviarMeta(pagamento: Pagamento, doacao: NonNullable<ReturnType<typeof validarDoacao>>) {
    const pixelId = process.env.META_PIXEL_ID;
    const token = process.env.META_CAPI_ACCESS_TOKEN;
    if (!pixelId || !token || !doacao.metadata.consentimento_marketing) return false;

    const { metadata } = doacao;
    const aprovadoEm = pagamento.date_approved ? Date.parse(pagamento.date_approved) : Date.now();

    const evento = {
        event_name: META_EVENTO,
        event_time: Math.floor(aprovadoEm / 1000),
        // Mesmo id em qualquer reenvio: o Meta descarta duplicados.
        event_id: doacao.rastreioId,
        action_source: "website",
        event_source_url: `${process.env.FRONTEND_URL ?? ""}/doar`,
        user_data: {
            em: sha256(pagamento.payer?.email),
            fn: sha256(pagamento.payer?.first_name),
            ln: sha256(pagamento.payer?.last_name),
            country: sha256("br"),
            fbp: metadata.fbp ?? undefined,
            fbc: metadata.fbc ?? undefined,
            client_ip_address: metadata.client_ip ?? undefined,
            client_user_agent: metadata.client_user_agent ?? undefined,
        },
        custom_data: {
            value: doacao.valor,
            currency: "BRL",
            order_id: doacao.paymentId,
        },
    };

    const resposta = await fetch(
        `https://graph.facebook.com/${META_GRAPH_VERSION}/${pixelId}/events?access_token=${token}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                data: [evento],
                // Preencher só enquanto testa em "Eventos de teste" no Gerenciador.
                ...(process.env.META_TEST_EVENT_CODE ? { test_event_code: process.env.META_TEST_EVENT_CODE } : {}),
            }),
        },
    );

    if (!resposta.ok) {
        throw new Error(`[conversao] Meta respondeu ${resposta.status}: ${await resposta.text()}`);
    }
    return true;
}

async function enviarGA4(doacao: NonNullable<ReturnType<typeof validarDoacao>>) {
    const measurementId = process.env.GA4_MEASUREMENT_ID;
    const apiSecret = process.env.GA4_API_SECRET;
    const { metadata } = doacao;
    // Sem o client_id do navegador o GA4 não liga a compra à visita/campanha.
    if (!measurementId || !apiSecret || !metadata.consentimento_estatisticas || !metadata.ga_client_id) {
        return false;
    }

    const resposta = await fetch(
        `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                client_id: metadata.ga_client_id,
                events: [
                    {
                        name: "purchase",
                        params: {
                            transaction_id: doacao.paymentId,
                            value: doacao.valor,
                            currency: "BRL",
                            // session_id faz o GA4 atribuir a compra à campanha da visita.
                            ...(metadata.ga_session_id ? { session_id: metadata.ga_session_id } : {}),
                            engagement_time_msec: 1,
                            items: [{ item_id: "doacao-avulsa", item_name: "Doação", price: doacao.valor, quantity: 1 }],
                        },
                    },
                ],
            }),
        },
    );

    // O Measurement Protocol responde 2xx mesmo com payload inválido; erros
    // de formato só aparecem no endpoint /debug/mp/collect.
    if (!resposta.ok) {
        throw new Error(`[conversao] GA4 respondeu ${resposta.status}`);
    }
    return true;
}

export async function registrarConversaoDoacao(pagamento: Pagamento): Promise<void> {
    const doacao = validarDoacao(pagamento);
    if (!doacao) return;

    // Reserva o pagamento antes de enviar; se outra notificação já reservou, sai.
    try {
        await ConversaoDoacao.create({ paymentId: doacao.paymentId, rastreioId: doacao.rastreioId, valor: doacao.valor });
    } catch (err: any) {
        if (err?.code === 11000) return;
        throw err;
    }

    try {
        const [enviadoMeta, enviadoGA4] = await Promise.all([enviarMeta(pagamento, doacao), enviarGA4(doacao)]);
        await ConversaoDoacao.updateOne({ paymentId: doacao.paymentId }, { enviadoMeta, enviadoGA4 });
        console.info("[conversao] doação reportada", doacao.paymentId, { enviadoMeta, enviadoGA4 });
    } catch (err) {
        // Libera a reserva para a próxima notificação do MP tentar de novo
        // (o event_id/transaction_id iguais evitam contagem dupla).
        await ConversaoDoacao.deleteOne({ paymentId: doacao.paymentId });
        throw err;
    }
}

import { mercadoPagoDoacaoClient } from "../mercadoPago/criarPreferenciaDoacao.js";
import { mercadoPagoPixClient, PIX_EXPIRACAO_MINUTOS } from "../mercadoPago/criarPixDoacao.js";
import { buscarPagamento } from "../mercadoPago/buscarPagamento.js";
import { mapearStatusMP, sincronizarFinanceiroDoPagamento } from "./mercadoPago.service.js";
import { registrarConversaoDoacao } from "./conversao.service.js";
import { UTM_SOURCE, type UtmSource, type UtmMetadata, UTM_MEDIUM, type UtmMedium, type UtmCampaign, UTM_CAMPAIGN } from "../types/origem.types.js";
import type ResponseType from "../types/response.type.js";
import { normalizarRastreio, type RastreioMetadata } from "../types/rastreio.types.js";
import { InvalidEnumError, InvalidIdError, MissingParamsError, NotFoundError } from "../utils/errors.js";




export function validarParametros(utmSource: UtmSource | null, utmMedium: UtmMedium | null, utmCampaign: UtmCampaign | null) {


    if (utmSource !== undefined && utmSource !== null && !UTM_SOURCE.includes(utmSource as UtmSource)) {
        throw new InvalidEnumError(
            `utmSource inválido '${String(utmSource)}'. Valores permitidos: ${UTM_SOURCE.join(", ")}.`,
        );
    }

    if (utmMedium !== undefined && utmMedium !== null && !UTM_MEDIUM.includes(utmMedium as UtmMedium)) {

        throw new InvalidEnumError(
            `utmMedium inválido '${String(utmMedium)}'. Deve ser uma string ou nulo.`,
        );

    }

    if (utmCampaign !== undefined && utmCampaign !== null && !UTM_CAMPAIGN.includes(utmCampaign as UtmCampaign)) {

        throw new InvalidEnumError(
            `utmCampaign inválido '${String(utmCampaign)}'. Deve ser uma string ou nulo.`,
        );

    }

}


export function normalizarParametros(origem: UtmMetadata): UtmMetadata  {

    const normalizarUtm = (valor?: string | null): string | null => {
        const normalizado = valor?.trim().toUpperCase();
        return normalizado || null;
    };

    const utmSource = normalizarUtm(origem.utmSource);
    const utmMedium = normalizarUtm(origem.utmMedium);
    const utmCampaign = normalizarUtm(origem.utmCampaign);

    return {
        utmSource: utmSource ?? null,
        utmMedium: utmMedium ?? null,
        utmCampaign: utmCampaign ?? null,
    };
}


export const criarPreferenciaDoacao = async (
    valor: number,
    origem: UtmMetadata = {},
    rastreio: RastreioMetadata = normalizarRastreio(undefined, undefined, undefined),
) : Promise<ResponseType> => {

    try {

        if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) {
            throw new MissingParamsError(`O campo 'valor' deve ser um número inteiro válido.`);
        }


        if (typeof origem !== "object" || origem === null) {
            throw new MissingParamsError(`O campo 'origem' deve ser um objeto válido.`);
        }

        const { utmSource, utmMedium, utmCampaign } = normalizarParametros(origem);

        validarParametros(utmSource as UtmSource | null, utmMedium as UtmMedium | null, utmCampaign as UtmCampaign | null);

        const origemNormalizada: UtmMetadata = { 
            ...origem, 
            utmSource: utmSource?.toUpperCase() ?? null,
            utmMedium: utmMedium?.toUpperCase() ?? null,
            utmCampaign: utmCampaign?.toUpperCase() ?? null
        };
        const preferencia = await mercadoPagoDoacaoClient.criar(valor, origemNormalizada, rastreio);

        if(!preferencia || !preferencia.init_point) {

            throw new Error("Falha ao criar a preferência de doação.");

        }

        return {
            status: 200,
            message: "Preferência de doação criada com sucesso.",
            data: { initPoint: preferencia.init_point, preferenceId: preferencia.id }
        };


    } catch (error: any) { 

        console.error("Erro ao criar preferência de doação:", error);
        throw error;

     }
}


/** Mês e ano atuais no fuso de Brasília (o servidor na Vercel roda em UTC). */
function mesAtualBrasilia(): { mes: number; ano: number } {
    const partes = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "numeric",
    }).formatToParts(new Date());

    return {
        mes: Number(partes.find((p) => p.type === "month")?.value),
        ano: Number(partes.find((p) => p.type === "year")?.value),
    };
}

/**
 * Total arrecadado no mês corrente APENAS com doações do site: entradas
 * aprovadas via Mercado Pago, sem pagamentos da rifa solidária. O filtro é
 * aplicado pelo painel via query params (categoria=DOACAO exclui a rifa).
 */
export const buscarArrecadadoMes = async (): Promise<ResponseType> => {

    try {

        const PAINEL_ADM_URL = process.env.PAINEL_ADM_URL!;
        const INTERNAL_SECRET = process.env.PAINEL_ADM_INTERNAL_SECRET!;

        const { mes, ano } = mesAtualBrasilia();
        const params = new URLSearchParams({
            categoria: "DOACAO",
            status: "APROVADO",
            metodoPagamento: "MERCADO_PAGO",
            mes: String(mes),
            ano: String(ano),
            agregar: "total",
        });

        const response = await fetch(`${PAINEL_ADM_URL}/financeiro/interno/transferencias?${params}`, {
            headers: { "x-internal-secret": INTERNAL_SECRET },
        });

        if (!response.ok) {
            throw new Error(`[arrecadadoMes] painel respondeu ${response.status}: ${await response.text()}`);
        }

        const body = await response.json() as { data?: { total?: number } };
        const total = Number(body.data?.total);

        if (!Number.isFinite(total)) {
            throw new Error("[arrecadadoMes] painel devolveu um total inválido.");
        }

        return {
            status: 200,
            message: "Total arrecadado em doações no mês.",
            data: { total }
        };

    } catch (error: any) {

        console.error("Erro ao buscar total arrecadado no mês:", error);
        throw error;
    }
}


// ---------- Pix dentro do site (Checkout Transparente só pro Pix) ----------

/** Mesmo mínimo do frontend (MIN_DONATION_AMOUNT). */
const VALOR_MINIMO_PIX = 0.1;
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type StatusPix = "APROVADO" | "PENDENTE" | "CANCELADO" | "EXPIRADO";

interface CriarPixArgs {
    valor: unknown;
    email: unknown;
    origem?: UtmMetadata;
    dadosRastreio?: RastreioMetadata;
}

export const criarPix = async ({
    valor,
    email,
    origem = {},
    dadosRastreio = normalizarRastreio(undefined, undefined, undefined),
}: CriarPixArgs): Promise<ResponseType> => {

    try {

        if (typeof valor !== "number" || !Number.isFinite(valor) || valor < VALOR_MINIMO_PIX) {
            throw new MissingParamsError(`O campo 'valor' deve ser um número a partir de ${VALOR_MINIMO_PIX}.`);
        }

        // O mesmo número vai em transaction_amount e em valor_esperado: a
        // conversão (conversao.service.ts) só é reportada se os dois baterem.
        const valorPix = Math.round(valor * 100) / 100;

        const emailNormalizado = typeof email === "string" ? email.trim() : "";
        if (emailNormalizado.length > 254 || !EMAIL_VALIDO.test(emailNormalizado)) {
            throw new MissingParamsError(`O campo 'email' deve ser um e-mail válido.`);
        }

        const origemNormalizada = normalizarParametros(origem);
        const { utmSource, utmMedium, utmCampaign } = origemNormalizada;
        validarParametros(utmSource as UtmSource | null, utmMedium as UtmMedium | null, utmCampaign as UtmCampaign | null);

        const pagamento = await mercadoPagoPixClient.criar({
            valor: valorPix,
            email: emailNormalizado,
            origem: origemNormalizada,
            rastreio: dadosRastreio,
        });

        const qrCode = pagamento?.point_of_interaction?.transaction_data?.qr_code;
        const qrCodeBase64 = pagamento?.point_of_interaction?.transaction_data?.qr_code_base64;

        if (!pagamento?.id || !qrCode || !qrCodeBase64) {
            throw new Error("O Mercado Pago não devolveu o QR code do Pix.");
        }

        return {
            status: 201,
            message: "Pix criado com sucesso.",
            data: {
                paymentId: pagamento.id,
                rastreioId: pagamento.external_reference,
                qrCode,
                qrCodeBase64,
                expiraEm: pagamento.date_of_expiration
                    ?? new Date(Date.now() + PIX_EXPIRACAO_MINUTOS * 60_000).toISOString(),
            },
        };

    } catch (error: any) {

        console.error("Erro ao criar Pix da doação:", error);
        throw error;
    }
}

/**
 * Status de um Pix criado pelo site. O ref (rastreioId) precisa bater com o
 * external_reference: o paymentId é sequencial, e sem essa conferência daria
 * pra consultar pagamentos de outras pessoas.
 */
export const consultarStatusPix = async (paymentId: unknown, ref: unknown): Promise<ResponseType> => {

    if (typeof paymentId !== "string" || !/^\d{1,20}$/.test(paymentId)) {
        throw new InvalidIdError("paymentId inválido.");
    }

    if (typeof ref !== "string" || !UUID_VALIDO.test(ref)) {
        throw new InvalidIdError("ref inválido.");
    }

    let pagamento: Awaited<ReturnType<typeof buscarPagamento>>;
    try {
        pagamento = await buscarPagamento(paymentId);
    } catch (error: any) {
        if (error?.status === 404) throw new NotFoundError("Pix não encontrado.");
        throw error;
    }

    if (pagamento.external_reference !== ref || pagamento.metadata?.tipo !== "DOACAO") {
        throw new NotFoundError("Pix não encontrado.");
    }

    const venceu = pagamento.date_of_expiration
        ? Date.parse(pagamento.date_of_expiration) <= Date.now()
        : false;

    let status: StatusPix;
    if (pagamento.status === "cancelled" && pagamento.status_detail === "expired") {
        status = "EXPIRADO";
    } else if (pagamento.status === "pending" && venceu) {
        status = "EXPIRADO";
    } else {
        status = mapearStatusMP(pagamento.status ?? "pending") as StatusPix;
    }

    if (status === "APROVADO") {
        // O webhook é quem registra a doação; isso só cobre o caso de ele
        // atrasar. As duas operações são idempotentes.
        await registrarConversaoDoacao(pagamento).catch((err) =>
            console.error("[status-pix] falha ao reportar conversão", paymentId, err)
        );
        await sincronizarFinanceiroDoPagamento(pagamento).catch((err) =>
            console.error("[status-pix] falha ao sincronizar painel", paymentId, err)
        );
    }

    return {
        status: 200,
        message: "Status do Pix.",
        data: { status },
    };
}

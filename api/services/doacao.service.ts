import { mercadoPagoDoacaoClient } from "../mercadoPago/criarPreferenciaDoacao.js";
import { UTM_SOURCE, type UtmSource, type UtmMetadata, UTM_MEDIUM, type UtmMedium, type UtmCampaign, UTM_CAMPAIGN } from "../types/origem.types.js";
import type ResponseType from "../types/response.type.js";
import { normalizarRastreio, type RastreioMetadata } from "../types/rastreio.types.js";
import { InvalidEnumError, MissingParamsError } from "../utils/errors.js";




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

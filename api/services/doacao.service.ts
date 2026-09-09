import { mercadoPagoDoacaoClient } from "../mercadoPago/criarPreferenciaDoacao.js";
import { UTM_SOURCE, type UtmSource, type UtmMetadata, UTM_MEDIUM, type UtmMedium, type UtmCampaign, UTM_CAMPAIGN } from "../types/origem.types.js";
import type ResponseType from "../types/response.type.js";
import { InvalidEnumError, MissingParamsError } from "../utils/errors.js";




function validarParametros(valor: number, utmSource: UtmSource | null, utmMedium: UtmMedium | null, utmCampaign: UtmCampaign | null) {

    if (typeof valor !== "number" || !Number.isInteger(valor) || valor < 0) {
        throw new MissingParamsError(`O campo 'valor' deve ser um número inteiro válido.`);
    }


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

export const criarPreferenciaDoacao = async (valor: number, origem: UtmMetadata = {}) : Promise<ResponseType> => {

    try {

        if (typeof valor !== "number" || !Number.isInteger(valor) || valor < 0) {
        throw new MissingParamsError(`O campo 'valor' deve ser um número inteiro válido.`);
        }

        if (typeof origem !== "object" || origem === null) {
            throw new MissingParamsError(`O campo 'origem' deve ser um objeto válido.`);
        }

        const utmSource = typeof origem.utmSource === "string"
            ? origem.utmSource.toUpperCase()
            : origem.utmSource;
        
        const utmMedium = typeof origem.utmMedium === "string"

            ? origem.utmMedium.toUpperCase()
            : origem.utmMedium;

        const utmCampaign = typeof origem.utmCampaign === "string"
            ? origem.utmCampaign.toUpperCase()
            : origem.utmCampaign;
        
        validarParametros(valor, utmSource as UtmSource | null, utmMedium as UtmMedium | null, utmCampaign as UtmCampaign | null);

        const origemNormalizada: UtmMetadata = { 
            ...origem, 
            utmSource: utmSource?.toUpperCase() ?? null,
            utmMedium: utmMedium?.toUpperCase() ?? null,
            utmCampaign: utmCampaign?.toUpperCase() ?? null
        };
        const preferencia = await mercadoPagoDoacaoClient.criar(valor, origemNormalizada);

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
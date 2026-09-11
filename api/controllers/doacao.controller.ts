import {type NextFunction, type Request, type Response} from "express";
import * as doacaoService from "../services/doacao.service.js";
import type { UtmMetadata } from "../types/origem.types.js";

export const criarPagamento = async(req: Request<UtmMetadata, any, { valor: number } & UtmMetadata>, res: Response, next: NextFunction) => {

    try {

        const { valor, utmSource, utmMedium, utmCampaign } = req.body;

        const origem: UtmMetadata = {
            utmSource: utmSource ?? null,
            utmMedium: utmMedium ?? null,
            utmCampaign: utmCampaign ?? null,
        };

        const resposta = await doacaoService.criarPreferenciaDoacao(valor, origem);
        return res.status(resposta.status).json({ message: resposta.message, data: resposta.data });

    } catch (error) {

        next(error);
    }
}
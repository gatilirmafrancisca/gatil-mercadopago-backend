import {type NextFunction, type Request, type Response} from "express";
import * as doacaoService from "../services/doacao.service.js";
import type { UtmMetadata } from "../types/origem.types.js";

export const criarPagamento = async(req: Request<UtmMetadata, any, { valor: number }>, res: Response, next: NextFunction) => {

    try {

        const { valor } = req.body;
        const utmSource = req.query.utmSource;

        const origem: UtmMetadata = {
            utmSource: (utmSource as string | undefined) ?? null,
            utmMedium: (req.query.utmMedium as string | undefined) ?? null,
            utmCampaign: (req.query.utmCampaign as string | undefined) ?? null,
        };

        const resposta = await doacaoService.criarPreferenciaDoacao(valor, origem);
        return res.status(resposta.status).json({ message: resposta.message, data: resposta.data });

    } catch (error) {

        next(error);
    }
}
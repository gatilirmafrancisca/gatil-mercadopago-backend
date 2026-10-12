import {type NextFunction, type Request, type Response} from "express";
import * as doacaoService from "../services/doacao.service.js";
import type { UtmMetadata } from "../types/origem.types.js";
import { normalizarRastreio, type RastreioDoacao } from "../types/rastreio.types.js";

export const criarPagamento = async(req: Request<UtmMetadata, any, { valor: number; rastreio?: RastreioDoacao } & UtmMetadata>, res: Response, next: NextFunction) => {

    try {

        const { valor, utmSource, utmMedium, utmCampaign, rastreio } = req.body;

        const origem: UtmMetadata = {
            utmSource: utmSource ?? null,
            utmMedium: utmMedium ?? null,
            utmCampaign: utmCampaign ?? null,
        };

        const dadosRastreio = normalizarRastreio(rastreio, req.ip, req.get("user-agent"));

        const resposta = await doacaoService.criarPreferenciaDoacao(valor, origem, dadosRastreio);
        return res.status(resposta.status).json({ message: resposta.message, data: resposta.data });

    } catch (error) {

        next(error);
    }
}

export const arrecadadoMes = async(req: Request, res: Response, next: NextFunction) => {

    try {

        const resposta = await doacaoService.buscarArrecadadoMes();
        return res.status(resposta.status).json({ message: resposta.message, data: resposta.data });

    } catch (error) {

        next(error);
    }
}

export const criarPix = async(req: Request<UtmMetadata, any, { valor: number; email: string; rastreio?: RastreioDoacao } & UtmMetadata>, res: Response, next: NextFunction) => {

    try {

        const { valor, email, utmSource, utmMedium, utmCampaign, rastreio } = req.body ?? {};

        const origem: UtmMetadata = {
            utmSource: utmSource ?? null,
            utmMedium: utmMedium ?? null,
            utmCampaign: utmCampaign ?? null,
        };

        const dadosRastreio = normalizarRastreio(rastreio, req.ip, req.get("user-agent"));

        const resposta = await doacaoService.criarPix({ valor, email, origem, dadosRastreio });
        return res.status(resposta.status).json({ message: resposta.message, data: resposta.data });

    } catch (error) {

        next(error);
    }

}

export const statusPix = async(req: Request<{ paymentId: string }>, res: Response, next: NextFunction) => {

    try {

        const resposta = await doacaoService.consultarStatusPix(req.params.paymentId, req.query.ref);
        return res.status(resposta.status).json({ message: resposta.message, data: resposta.data });

    } catch (error) {

        next(error);
    }
}
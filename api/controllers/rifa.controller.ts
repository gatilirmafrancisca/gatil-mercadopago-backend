import {type NextFunction, type Request, type Response} from "express";
import { criarPreferenciaRifa } from "../mercadoPago/criarPreferenciaRifa.js";
import { confirmarNumeroRifa, getAllRifasService } from "../services/rifa.service.js";
import Rifa from "../models/Rifa.js";
import * as RifaTypes from "../types/rifa.types.js";
import type { AuthenticatedRequest } from "../middlewares/token.middleware.js";
import { enviarEmailConfirmacao } from "../services/email.service.js";
import type { UtmCampaign, UtmMedium, UtmSource, UtmMetadata } from "../types/origem.types.js";
import { normalizarParametros, validarParametros } from "../services/doacao.service.js";


export const getPreferencia = async(req: Request<UtmMetadata, any, any>, res: Response, next: NextFunction) => {
    
    try {

        const origem: UtmMetadata = {

            utmSource: (req.query.utmSource as string | undefined) ?? null,
            utmMedium: (req.query.utmMedium as string | undefined) ?? null,
            utmCampaign: (req.query.utmCampaign as string | undefined) ?? null,
        };

        const origemNormalizada = normalizarParametros(origem);
        const { utmSource, utmMedium, utmCampaign } = origemNormalizada;

        validarParametros(utmSource as UtmSource | null, utmMedium as UtmMedium | null, utmCampaign as UtmCampaign | null);

        const vagasOcupadas = await Rifa.countDocuments({
            status: { $ne: "CANCELADO" satisfies RifaTypes.StatusRifaType },
        });
    
        if (vagasOcupadas >= RifaTypes.TOTAL_NUMEROS) {
            return res.status(409).json({ message: "Não há mais números disponíveis nesta rifa." });
        }
    
        const preferencia = await criarPreferenciaRifa(origemNormalizada);
        res.json({ initPoint: preferencia.init_point });

    } catch (error) {
        next(error);
    }

}

export const confirmarNumero = async(req: AuthenticatedRequest, res: Response, next: NextFunction) => {

    try {

        const resposta = await confirmarNumeroRifa(req.paymentId!, req.body);
        return res.status(resposta.status).json({ message: resposta.message, data: resposta.data });

    } catch (error) {
        next(error);
    }

}

export const getAllRifas = async(_req: Request, res: Response, next: NextFunction) => {

    try {

        const resposta = await getAllRifasService();
        return res.status(resposta.status).json({ message: resposta.message, data: resposta.data });

    } catch (error) {
        next(error);
    }
}

export const reenviarEmail = async(req: Request, res: Response, next: NextFunction) => {

    try {

        const paymentId = String(req.body?.paymentId ?? "");
        if (!paymentId) return res.status(400).json({ message: "paymentId ausente." });

        const pagamento = await Rifa.findOne({ paymentId });

        if (!pagamento || pagamento.claimedNumber === null || !pagamento.email) {
            return res.status(404).json({ message: "Nada pra reenviar pra esse pagamento." });
        }

        const enviado = await enviarEmailConfirmacao({
            name: pagamento.name ?? "participante",
            email: pagamento.email,
            claimedNumber: pagamento.claimedNumber,
        });

        if (!enviado) {
            return res.status(502).json({ message: "Não conseguimos reenviar agora. Tenta de novo em instantes." });
        }

        res.json({ message: "E-mail reenviado." });

    } catch (error) {

        next(error);
    }
}
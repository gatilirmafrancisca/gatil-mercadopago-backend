import {type NextFunction, type Request, type Response} from "express";
import { criarPreferenciaRifa } from "../mercadoPago/criarPreferenciaRifa.js";
import { confirmarNumeroRifa, getAllRifasService } from "../services/rifa.service.js";
import Rifa from "../models/Rifa.js";
import * as RifaTypes from "../types/rifa.types.js";
import type { AuthenticatedRequest } from "../middlewares/token.middleware.js";
import { enviarEmailConfirmacao } from "../services/email.service.js";


export const getPreferencia = async(_req: Request, res: Response, next: NextFunction) => {

    
    try {
        const vagasOcupadas = await Rifa.countDocuments({
            status: { $ne: "cancelado" satisfies RifaTypes.StatusRifaType },
        });
    
        if (vagasOcupadas >= RifaTypes.TOTAL_NUMEROS) {
            return res.status(409).json({ message: "Não há mais números disponíveis nesta rifa." });
        }
    
        const preferencia = await criarPreferenciaRifa();
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
import { type Request, type Response } from "express";
import { verificarAssinaturaMP } from "../mercadoPago/verificarAssinatura.js";
import { processarNotificacaoPagamento, mapearStatusMP } from "../services/mercadoPago.service.js";
import { registrarPagamentoRifa } from "../services/rifa.service.js";
import Rifa, { type IRifa } from "../models/Rifa.js";
import { buscarPagamento } from "../mercadoPago/buscarPagamento.js";
import * as RifaTypes from "../types/rifa.types.js";
import { ConflictError } from "../utils/errors.js";
import jwt from "jsonwebtoken";

const { sign } = jwt;

export const WebhookController = async (req: Request, res: Response) => {
    const assinaturaValida = verificarAssinaturaMP({
        xSignature: req.header("x-signature"),
        xRequestId: req.header("x-request-id"),
        dataId: req.body?.data?.id ?? req.query["data.id"],
        secret: process.env.MP_WEBHOOK_SECRET!,
    });

    if (!assinaturaValida) {
        return res.status(401).json({ message: "Assinatura inválida." });
    }

    res.status(200).end();
    void processarNotificacaoPagamento(req.body);
};

export const VerificarPagamentoController = async (req: Request, res: Response) => {

    try {
        const paymentId = String(req.query.payment_id ?? "");
        if (!paymentId) return res.status(400).json({ message: "payment_id ausente" });

        let pagamento = await Rifa.findOne({ paymentId });

        if (!pagamento) {
            
            const dadoReal = await buscarPagamento(paymentId);
            if (dadoReal.status !== "approved") {
                return res.status(402).json({ message: "Pagamento não aprovado." });
            }

            const dadosCriacao: Partial<Omit<IRifa, "paymentId">> = {
                status: mapearStatusMP(dadoReal.status!),
                amount: RifaTypes.TICKET_PRICE_BRL,
                ...(dadoReal.payer?.email ? { email: dadoReal.payer.email } : {}),
            };

            try {
                
                await registrarPagamentoRifa(paymentId, dadosCriacao);
                pagamento = await Rifa.findOne({ paymentId });

            } catch (error) {
                if (error instanceof ConflictError) {

                    pagamento = await Rifa.findOne({ paymentId });
                } else {
                    
                    throw error;
                }
            }
        
        }
        
        if (!pagamento) {
            return res.status(500).json({ message: "Não foi possível confirmar o pagamento agora." });
        }

        if (pagamento.status !== "APROVADO") {
            return res.status(402).json({ message: "Pagamento não aprovado." });
        }
        if (pagamento.claimedNumber !== null) {

            // Não é um erro de verdade — a pessoa já concluiu esse
            // fluxo antes (ex: recarregou a página). Devolve o número
            // pra o frontend mostrar a confirmação de novo, em vez de
            // tratar isso como se o pagamento tivesse sido recusado.

            return res.status(409).json({ message: "Este pagamento já escolheu um número.", claimedNumber: pagamento.claimedNumber });
        }

        const token = sign({ paymentId }, process.env.JWT_SECRET!, {
        expiresIn: "30m",
        });

        res.json({ token });
    }
    catch (error) {

        console.error("[verificar-pagamento] erro", req.query.payment_id, error);
        res.status(500).json({ message: "Erro ao verificar pagamento. Tente novamente." });
        
    }

}
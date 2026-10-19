import {type NextFunction, type Request, type Response} from "express";
import { criarPreferenciaRifa } from "../mercadoPago/criarPreferenciaRifa.js";
import { confirmarNumeroRifa, consultarStatusPixRifa, criarPixRifa, executarTarefasNoUso, getAllRifasService, haNumerosDisponiveis, tarefasDaRifa } from "../services/rifa.service.js";
import Rifa from "../models/Rifa.js";
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

        await executarTarefasNoUso();

        if (!(await haNumerosDisponiveis())) {
            return res.status(409).json({ message: "Não há mais números disponíveis nesta rifa." });
        }
    
        const preferencia = await criarPreferenciaRifa(origemNormalizada);
        res.json({ initPoint: preferencia.init_point });

    } catch (error) {
        next(error);
    }

}

export const criarPix = async(req: Request<any, any, { email: string } & UtmMetadata>, res: Response, next: NextFunction) => {

    try {

        const { email, utmSource, utmMedium, utmCampaign } = req.body ?? {};

        const origem: UtmMetadata = {
            utmSource: utmSource ?? null,
            utmMedium: utmMedium ?? null,
            utmCampaign: utmCampaign ?? null,
        };

        const resposta = await criarPixRifa({ email, origem, chaveTeste: req.header("x-pix-teste") });
        return res.status(resposta.status).json({ message: resposta.message, data: resposta.data });

    } catch (error) {
        next(error);
    }
}

export const statusPix = async(req: Request<{ paymentId: string }>, res: Response, next: NextFunction) => {

    try {

        const resposta = await consultarStatusPixRifa(req.params.paymentId, req.query.ref);
        return res.status(resposta.status).json({ message: resposta.message, data: resposta.data });

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
            teste: pagamento.teste,
        });

        if (!enviado) {
            return res.status(502).json({ message: "Não conseguimos reenviar agora. Tenta de novo em instantes." });
        }

        res.json({ message: "E-mail reenviado." });

    } catch (error) {

        next(error);
    }
}
/** Por chamada do agendador: o resto vai na próxima (os mais antigos primeiro). */
const LIMITE_TAREFAS_DIARIAS = 50;

/**
 * Chamado 1×/dia pelo Cron da Vercel (vercel.json), que manda
 * "Authorization: Bearer <CRON_SECRET>": confere os Pix pendentes vencidos,
 * envia os lembretes de escolha do número e sorteia quando o prazo vence.
 * Sem CRON_SECRET configurado, a rota fica fechada.
 */
export const tarefasDiarias = async(req: Request, res: Response, next: NextFunction) => {

    try {

        const segredo = process.env.CRON_SECRET;
        if (!segredo || req.header("authorization") !== `Bearer ${segredo}`) {
            return res.status(401).json({ message: "Não autorizado." });
        }

        const { pendentes, contatos, escolhas } = await tarefasDaRifa({ limite: LIMITE_TAREFAS_DIARIAS });
        const atualizados = pendentes.filter((c) => c.aplicado);

        console.info(
            "[tarefas rifa]", pendentes.length, "pendente(s) conferido(s),", atualizados.length, "atualizado(s),",
            contatos.filter((c) => c.email).length, "e-mail(s) encontrado(s),",
            escolhas.lembretes.length, "lembrete(s),", escolhas.sorteados.length, "sorteio(s)"
        );
        res.json({
            message: "Tarefas da rifa concluídas.",
            data: {
                conferidos: pendentes.length,
                atualizados,
                contatos,
                lembretes: escolhas.lembretes,
                sorteados: escolhas.sorteados,
            },
        });

    } catch (error) {
        next(error);
    }
}

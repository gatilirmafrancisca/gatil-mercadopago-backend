import {type NextFunction, type Request, type Response} from "express";
import { criarPreferenciaRifa } from "../mercadoPago/criarPreferenciaRifa.js";
import { chavePixTesteValida, confirmarNumeroRifa, consultarStatusPixRifa, criarPixRifa, executarTarefasNoUso, getAllRifasService, haNumerosDisponiveis, tarefasDaRifa } from "../services/rifa.service.js";
import * as pedidoService from "../services/pedido.service.js";
import { ForbiddenError, GoneError } from "../utils/errors.js";

/**
 * Fluxo antigo (paga primeiro, escolhe depois): GET /criar-pagamento e
 * POST /criar-pix sem reservaId. Fica ligado enquanto RIFA_FLUXO_LEGADO não
 * for "false", para poder voltar atrás se o fluxo com reserva der problema.
 */
const fluxoLegadoAtivo = () => process.env.RIFA_FLUXO_LEGADO !== "false";
const erroFluxoLegado = () => new GoneError("Escolha seus números no quadro antes de pagar.");

/** Header x-pix-teste: ausente = normal; igual a PIX_TESTE_CHAVE = teste; outro valor = recusado. */
function modoTeste(req: Request): boolean {
    const chave = req.header("x-pix-teste");
    if (chave === undefined) return false;
    if (!chavePixTesteValida(chave)) throw new ForbiddenError("Chave de teste inválida.");
    return true;
}
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

        if (!fluxoLegadoAtivo()) throw erroFluxoLegado();

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

export const criarPix = async(req: Request<any, any, { email: string; reservaId?: unknown } & UtmMetadata & Record<string, unknown>>, res: Response, next: NextFunction) => {

    try {

        // Compra com reserva: Pix do total da reserva.
        if (req.body?.reservaId !== undefined) {
            const resposta = await pedidoService.criarPagamentoPedido({ reservaId: req.body.reservaId, metodo: "pix", corpo: req.body });
            return res.status(resposta.status).json({ message: resposta.message, data: resposta.data });
        }

        if (!fluxoLegadoAtivo()) throw erroFluxoLegado();

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

// ---------- Compra com reserva (escolhe os números antes de pagar) ----------

export const reservar = async(req: Request, res: Response, next: NextFunction) => {
    try {
        const { numeros, utmSource, utmMedium } = req.body ?? {};
        const resposta = await pedidoService.reservarNumeros({
            numeros,
            origem: { utmSource: utmSource ?? null, utmMedium: utmMedium ?? null },
            ...(req.ip ? { ip: req.ip } : {}),
            teste: modoTeste(req),
        });
        return res.status(resposta.status).json({ message: resposta.message, data: resposta.data });
    } catch (error) {
        next(error);
    }
}

export const buscarReserva = async(req: Request<{ reservaId: string }>, res: Response, next: NextFunction) => {
    try {
        const resposta = await pedidoService.buscarReserva(req.params.reservaId);
        return res.status(resposta.status).json({ message: resposta.message, data: resposta.data });
    } catch (error) {
        next(error);
    }
}

export const liberarReserva = async(req: Request, res: Response, next: NextFunction) => {
    try {
        const resposta = await pedidoService.liberarReserva(req.body?.reservaId);
        return res.status(resposta.status).json({ message: resposta.message, data: resposta.data });
    } catch (error) {
        next(error);
    }
}

/** Cartão (Checkout Pro) do total da reserva. */
export const criarPagamentoCartao = async(req: Request, res: Response, next: NextFunction) => {
    try {
        const resposta = await pedidoService.criarPagamentoPedido({ reservaId: req.body?.reservaId, metodo: "cartao", corpo: req.body });
        const data = resposta.data as { initPoint: string };
        // initPoint no topo: o front lê { initPoint } como no fluxo antigo.
        return res.status(resposta.status).json({ message: resposta.message, initPoint: data.initPoint, data });
    } catch (error) {
        next(error);
    }
}

/** Volta do cartão: GET /compra?payment_id=&ref=<external_reference> */
export const consultarCompra = async(req: Request, res: Response, next: NextFunction) => {
    try {
        const resposta = await pedidoService.consultarCompra(req.query.payment_id, req.query.ref);
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

export const reenviarEmail = async(req: AuthenticatedRequest, res: Response, next: NextFunction) => {

    try {

        // O pagamento vem do token, nunca do corpo: senão qualquer token
        // reenviava o e-mail (com o nome e o número) de outro pagamento.
        const paymentId = req.paymentId!;
        const pedido = req.body?.paymentId;
        if (pedido !== undefined && String(pedido) !== paymentId) {
            return res.status(403).json({ message: "Esse token não é deste pagamento." });
        }

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

        const { pendentes, contatos, escolhas, pedidos } = await tarefasDaRifa({ limite: LIMITE_TAREFAS_DIARIAS });
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
                pedidos,
            },
        });

    } catch (error) {
        next(error);
    }
}

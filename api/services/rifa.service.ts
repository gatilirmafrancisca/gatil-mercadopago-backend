import Rifa, { type IRifa } from "../models/Rifa.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../utils/errors.js";
import {
    normalizarDadosCriacaoRifa,
    validarCriacaoRifa,
    normalizarDadosConfirmacaoRifa,
    validarConfirmacaoRifa,
    ehEmailValido,
} from "../utils/rifavalidar.js";
import type ResponseType from "../types/response.type.js";
import { enviarEmailConfirmacao } from "./email.service.js";
import * as RifaTypes from "../types/rifa.types.js";
import type { UtmCampaign, UtmMedium, UtmMetadata, UtmSource } from "../types/origem.types.js";
import { mercadoPagoPixRifaClient } from "../mercadoPago/criarPixRifa.js";
import { PIX_EXPIRACAO_MINUTOS } from "../mercadoPago/criarPixDoacao.js";
import {
    buscarPixDoSite,
    normalizarParametros,
    statusDoPix,
    validarEmailPix,
    validarParametros,
} from "./doacao.service.js";
import { buscarPagamento } from "../mercadoPago/buscarPagamento.js";
import { dadosRifaDoPagamento, sincronizarFinanceiroDoPagamento } from "./mercadoPago.service.js";
import { processarEscolhasPendentes, type ResultadoEscolhas } from "./lembretes.service.js";
import { createHash, timingSafeEqual } from "node:crypto";
import { Types } from "mongoose";

type Pagamento = Awaited<ReturnType<typeof buscarPagamento>>;


/** Ainda há números livres? Pagamentos cancelados e Pix de teste não ocupam vaga. */
export const haNumerosDisponiveis = async (): Promise<boolean> => {
    const vagasOcupadas = await Rifa.countDocuments({
        status: { $ne: "CANCELADO" satisfies RifaTypes.StatusRifaType },
        teste: { $ne: true },
    });
    return vagasOcupadas < RifaTypes.TOTAL_NUMEROS;
};


/**
 * ETAPA 1 — chamada pelo webhook do Mercado Pago.
 * Cria o registro só com o que o MP garante (status, amount, e-mail se
 * disponível). name/phone/claimedNumber nascem null.
 */
export const registrarPagamentoRifa = async (

    paymentId: string,
    dadosBase: Partial<Omit<IRifa, "paymentId">>

): Promise<ResponseType> => {
    try {
        const dadosNormalizados = normalizarDadosCriacaoRifa({ ...dadosBase, paymentId });
        await validarCriacaoRifa(dadosNormalizados);

        const dadosRifa = new Rifa(dadosNormalizados);
        await dadosRifa.save();

        console.log("Novo Cadastro Registrado: ", dadosRifa._id);

        return { status: 201, message: "Pagamento registrado.", data: { id: dadosRifa._id } };
    } catch (error: any) {
        if (error?.code === 11000) {
            // Reenvio do webhook para um paymentId já registrado — não é
            // uma falha real, é o comportamento esperado do Mercado Pago.
            throw new ConflictError("Este pagamento já foi registrado.");
        }

        console.error("registrarPagamentoRifa error:", error);
        throw error;
    }
};


/**
 * Registra o pagamento ou, se ele já existir, atualiza o status com o
 * dado real do Mercado Pago. Necessário pro PIX: o MP notifica primeiro
 * com "pending" e só depois com "approved" — sem essa atualização o
 * registro ficava PENDENTE pra sempre e a pessoa não conseguia escolher
 * o número.
 */
export const sincronizarPagamentoRifa = async (
    paymentId: string,
    dadosRecebidos: Partial<Omit<IRifa, "paymentId">>
): Promise<void> => {
    // O e-mail do MP é só um extra (a pessoa informa o dela ao escolher o
    // número): fora do formato, fica de fora em vez de impedir que o status
    // seja gravado — senão o pagamento ficava PENDENTE pra sempre.
    const { email, ...semEmail } = dadosRecebidos;
    const dadosBase: Partial<Omit<IRifa, "paymentId">> = ehEmailValido(email) ? dadosRecebidos : semEmail;
    const aprovado = dadosBase.status === "APROVADO";

    try {
        // aprovadoEm abre o prazo de escolha do número (lembretes.service.ts).
        await registrarPagamentoRifa(paymentId, { ...dadosBase, ...(aprovado ? { aprovadoEm: new Date() } : {}) });
    } catch (error) {
        if (!(error instanceof ConflictError)) throw error;

        await Rifa.updateOne(
            { paymentId },
            {
                $set: {
                    status: dadosBase.status,
                    ...(dadosBase.teste ? { teste: true } : {}),
                },
            },
            { runValidators: true }
        );

        if (aprovado) {
            await Rifa.updateOne({ paymentId, aprovadoEm: null }, { $set: { aprovadoEm: new Date() } });
        }

        // Só preenche o e-mail do MP se o participante ainda não informou um.
        if (dadosBase.email) {
            await Rifa.updateOne({ paymentId, email: null }, { $set: { email: dadosBase.email } });
        }
    }
};


export const confirmarNumeroRifa =async (paymentId: string, data: Record<string, any>): Promise<ResponseType> => {
    try {
        const dadosNormalizados = normalizarDadosConfirmacaoRifa(data);
        await validarConfirmacaoRifa(dadosNormalizados);

        // findOneAndUpdate com claimedNumber: null no filtro é o que
        // garante a atomicidade — se dois participantes tentarem
        // confirmar ao mesmo tempo, só o primeiro update encontra o
        // documento; o segundo cai no "rifaNaoEncontrada" abaixo.
        const rifaAtualizada = await Rifa.findOneAndUpdate(
            { paymentId, claimedNumber: null },
            {
                name: dadosNormalizados.name,
                phone: dadosNormalizados.phone,
                email: dadosNormalizados.email,
                claimedNumber: dadosNormalizados.claimedNumber,
            },
            { new: true, runValidators: true }
        );

        if (!rifaAtualizada) {
            const pagamentoExiste = await Rifa.exists({ paymentId });
            throw pagamentoExiste
                ? new ConflictError("Este pagamento já confirmou um número.")
                : new NotFoundError("Pagamento não encontrado ou ainda não processado.");
        }

        // Dispara depois da confirmação já estar salva — se o e-mail
        // falhar, o número continua reservado corretamente. A falha só
        // vira um "reenviar" manual depois, nunca desfaz a reserva.
        if (rifaAtualizada.email) {
            void enviarEmailConfirmacao({
                name: rifaAtualizada.name ?? "participante",
                email: rifaAtualizada.email,
                claimedNumber: rifaAtualizada.claimedNumber!,
                teste: rifaAtualizada.teste,
            });
        }

        return {
            status: 200,
            message: "Número confirmado.",
            data: { id: rifaAtualizada._id, claimedNumber: rifaAtualizada.claimedNumber },
        };
    } catch (error: any) {
        if (error?.code === 11000) {

            throw new ConflictError("Este número já foi escolhido por outro participante.");
        }

        console.error("confirmarNumeroRifa error:", error);
        throw error;
    }
};

export const getAllRifasService = async (): Promise<ResponseType> => {

    try {

        await executarTarefasNoUso();

        // Números de Pix de teste não ocupam a grade real.
        const rifas = await Rifa.find({ claimedNumber: { $ne: null }, teste: { $ne: true } }).distinct("claimedNumber");
        return { status: 200, message: "Rifas encontradas.", data: rifas };

    } catch (error: any) {

        console.error("getAllRifasService error:", error);
        throw error;
    }
};

// ---------- Pix dentro do site (rifa) ----------

interface CriarPixRifaArgs {
    email: unknown;
    origem?: UtmMetadata;
    /** Header x-pix-teste: ausente = Pix normal; igual a PIX_TESTE_CHAVE = Pix de R$ 0,01. */
    chaveTeste?: unknown;
}

/** Compara com PIX_TESTE_CHAVE em tempo constante. Sem a variável, o modo teste fica desligado. */
const chavePixTesteValida = (chave: unknown): boolean => {
    const esperada = process.env.PIX_TESTE_CHAVE;
    if (!esperada || typeof chave !== "string" || !chave) return false;
    // Hash dos dois lados: timingSafeEqual exige o mesmo tamanho.
    const a = createHash("sha256").update(chave).digest();
    const b = createHash("sha256").update(esperada).digest();
    return timingSafeEqual(a, b);
};

/**
 * Cria o Pix de um número da rifa. O valor é o do bilhete, definido no
 * servidor. Aprovado, o front leva pra /rifa/pagamento-aprovado, e o
 * verificar-pagamento segue exatamente como no pagamento por cartão.
 */
export const criarPixRifa = async ({ email, origem = {}, chaveTeste }: CriarPixRifaArgs): Promise<ResponseType> => {

    try {

        // Chave errada nunca vira um Pix de R$ 100 por engano: é recusada.
        const teste = chaveTeste !== undefined;
        if (teste && !chavePixTesteValida(chaveTeste)) {
            throw new ForbiddenError("Chave de teste inválida.");
        }

        const emailNormalizado = validarEmailPix(email);

        const origemNormalizada = normalizarParametros(origem);
        const { utmSource, utmMedium, utmCampaign } = origemNormalizada;
        validarParametros(utmSource as UtmSource | null, utmMedium as UtmMedium | null, utmCampaign as UtmCampaign | null);

        await executarTarefasNoUso();

        // O Pix de teste não ocupa vaga, então não depende do estoque.
        if (!teste && !(await haNumerosDisponiveis())) {
            throw new ConflictError("Não há mais números disponíveis nesta rifa.");
        }

        const pagamento = await mercadoPagoPixRifaClient.criar({
            email: emailNormalizado,
            origem: origemNormalizada,
            teste,
        });

        const qrCode = pagamento?.point_of_interaction?.transaction_data?.qr_code;
        const qrCodeBase64 = pagamento?.point_of_interaction?.transaction_data?.qr_code_base64;

        if (!pagamento?.id || !qrCode || !qrCodeBase64) {
            throw new Error("O Mercado Pago não devolveu o QR code do Pix.");
        }

        return {
            status: 201,
            message: "Pix criado com sucesso.",
            data: {
                paymentId: pagamento.id,
                rastreioId: pagamento.external_reference,
                valor: teste ? RifaTypes.VALOR_PIX_TESTE_BRL : RifaTypes.TICKET_PRICE_BRL,
                teste,
                qrCode,
                qrCodeBase64,
                expiraEm: pagamento.date_of_expiration
                    ?? new Date(Date.now() + PIX_EXPIRACAO_MINUTOS * 60_000).toISOString(),
            },
        };

    } catch (error: any) {

        console.error("Erro ao criar Pix da rifa:", error);
        throw error;
    }
};

/**
 * Status de um Pix da rifa criado pelo site. Só informa o status: quem
 * registra o pagamento é o webhook, e o verificar-pagamento cobre o atraso
 * dele quando o front leva a pessoa pra escolha do número.
 */
export const consultarStatusPixRifa = async (paymentId: unknown, ref: unknown): Promise<ResponseType> => {

    const pagamento = await buscarPixDoSite(paymentId, ref, "RIFA");
    const status = statusDoPix(pagamento);

    // O webhook é quem registra; isso só cobre o caso de ele atrasar ou
    // falhar enquanto a pessoa está com o Pix na tela. Falha aqui não pode
    // impedir o front de seguir.
    if (status !== "PENDENTE") {
        await aplicarStatusDoMercadoPago(pagamento).catch((err) =>
            console.error("[status-pix rifa] falha ao atualizar o banco", pagamento.id, err)
        );
    }

    return {
        status: 200,
        message: "Status do Pix.",
        data: { status },
    };
};

// ---------- Pendentes: banco x Mercado Pago ----------

/** Status da rifa no banco para um pagamento do MP: Pix vencido é CANCELADO. */
export const statusRifaDoPagamento = (pagamento: Pagamento): RifaTypes.StatusRifaType => {
    const status = statusDoPix(pagamento);
    return status === "EXPIRADO" ? "CANCELADO" : status;
};

/**
 * Leva ao banco (e ao painel) o status atual de um pagamento da rifa.
 * Aprovado: registra/atualiza. Cancelado ou vencido: só tira do PENDENTE —
 * nunca rebaixa um pagamento já APROVADO (ex: um número já escolhido).
 * Devolve o status aplicado, ou null se nada mudou.
 */
export const aplicarStatusDoMercadoPago = async (
    pagamento: Pagamento
): Promise<RifaTypes.StatusRifaType | null> => {

    const paymentId = String(pagamento.id);
    const status = statusRifaDoPagamento(pagamento);

    if (status === "APROVADO") {
        const registro = await Rifa.findOne({ paymentId }, { status: 1 }).lean();
        if (registro?.status === "APROVADO") return null;

        await sincronizarPagamentoRifa(paymentId, dadosRifaDoPagamento(pagamento, status));
    } else if (status === "CANCELADO") {
        const { modifiedCount } = await Rifa.updateOne(
            { paymentId, status: "PENDENTE" satisfies RifaTypes.StatusRifaType },
            { $set: { status } }
        );
        if (modifiedCount === 0) return null;
    } else {
        return null;
    }

    await sincronizarFinanceiroDoPagamento(pagamento, status).catch((err) =>
        console.error("[rifa] falha ao sincronizar painel", paymentId, err)
    );

    return status;
};

export interface PendenteConferido {
    paymentId: string;
    /** Status atual no MP, já no vocabulário do banco (Pix vencido = CANCELADO). */
    status: RifaTypes.StatusRifaType | "ERRO";
    email: string | null;
    teste: boolean;
    aplicado: boolean;
}

/**
 * Confere no Mercado Pago cada registro PENDENTE da rifa: pago vira
 * APROVADO (a pessoa ainda pode escolher o número), vencido ou recusado
 * vira CANCELADO e deixa de ocupar vaga. Sem `aplicar`, só lista.
 */
export const reconciliarPendentesRifa = async (
    { aplicar, limite, criadosAntesDe }: { aplicar: boolean; limite?: number; criadosAntesDe?: Date }
): Promise<PendenteConferido[]> => {

    // O schema não tem createdAt, mas o _id guarda a data de criação.
    const filtro: Record<string, unknown> = { status: "PENDENTE" satisfies RifaTypes.StatusRifaType };
    if (criadosAntesDe) {
        filtro._id = { $lt: Types.ObjectId.createFromTime(Math.floor(criadosAntesDe.getTime() / 1000)) };
    }

    // _id crescente = mais antigos primeiro (já vencidos, se não pagos).
    let consulta = Rifa.find(filtro, { paymentId: 1, email: 1, teste: 1 }).sort({ _id: 1 });
    if (limite) consulta = consulta.limit(limite);
    const pendentes = await consulta.lean();

    return Promise.all(pendentes.map(async ({ paymentId, email, teste }): Promise<PendenteConferido> => {
        try {
            const pagamento = await buscarPagamento(paymentId);
            const status = statusRifaDoPagamento(pagamento);
            const aplicado = aplicar && (await aplicarStatusDoMercadoPago(pagamento)) !== null;

            return { paymentId, status, email: email ?? pagamento.payer?.email ?? null, teste: teste ?? false, aplicado };
        } catch (err) {
            console.error("[reconciliar rifa] falha ao conferir", paymentId, err);
            return { paymentId, status: "ERRO", email: email ?? null, teste: teste ?? false, aplicado: false };
        }
    }));
};

// ---------- Tarefas da rifa: no uso do site e no Cron diário ----------

/** PENDENTE mais velho que isso já passou da validade do Pix (com folga). */
const IDADE_PENDENTE_VENCIDO_MS = (PIX_EXPIRACAO_MINUTOS + 5) * 60_000;

/** Pix pago vira APROVADO (e entra nos lembretes); vencido vira CANCELADO. */
export const conferirPendentesVencidos = (limite: number) =>
    reconciliarPendentesRifa({
        aplicar: true,
        limite,
        criadosAntesDe: new Date(Date.now() - IDADE_PENDENTE_VENCIDO_MS),
    });

export interface ResultadoTarefas {
    pendentes: PendenteConferido[];
    escolhas: ResultadoEscolhas;
}

/** Confere os pendentes vencidos e cuida de quem pagou e não escolheu o número. */
export const tarefasDaRifa = async ({ limite }: { limite: number }): Promise<ResultadoTarefas> => {
    const pendentes = await conferirPendentesVencidos(limite).catch((err) => {
        console.error("[tarefas rifa] falha ao conferir pendentes", err);
        return [] as PendenteConferido[];
    });
    const escolhas = await processarEscolhasPendentes({ limite });
    return { pendentes, escolhas };
};

const INTERVALO_TAREFAS_NO_USO_MS = 5 * 60_000;
const LIMITE_TAREFAS_NO_USO = 5;

// Objeto mutável de propósito — os testes zeram a última execução.
export const tarefasRifa = { ultimaExecucao: 0 };

/**
 * Roda as tarefas da rifa durante o uso normal do site (gerar pagamento,
 * abrir a grade): no máximo a cada 5 minutos por instância e com poucos
 * registros por vez, pra não atrasar a requisição. Com await: em
 * serverless, um "dispara e esquece" pode ser cortado. Nunca lança erro.
 */
export const executarTarefasNoUso = async (): Promise<void> => {
    if (Date.now() - tarefasRifa.ultimaExecucao < INTERVALO_TAREFAS_NO_USO_MS) return;
    tarefasRifa.ultimaExecucao = Date.now();

    await tarefasDaRifa({ limite: LIMITE_TAREFAS_NO_USO }).catch((err) =>
        console.error("[tarefas rifa] falha", err)
    );
};

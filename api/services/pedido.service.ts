import { createHash, randomUUID } from "node:crypto";
import type { QueryFilter } from "mongoose";
import Pedido, { type IPedido, type PagamentoPedido } from "../models/Pedido.js";
import Rifa, { semReservaVencida } from "../models/Rifa.js";
import * as RifaTypes from "../types/rifa.types.js";
import type ResponseType from "../types/response.type.js";
import type { UtmMetadata, UtmMedium, UtmSource } from "../types/origem.types.js";
import {
    ConflictError,
    GoneError,
    InvalidIdError,
    MissingParamsError,
    NotFoundError,
    TooManyRequestsError,
} from "../utils/errors.js";
import { buscarPagamento } from "../mercadoPago/buscarPagamento.js";
import { mercadoPagoPedidoClient, type DadosPagamentoPedido } from "../mercadoPago/pedidoMercadoPago.js";
import { normalizarParametros, validarEmailPix, validarParametros } from "./doacao.service.js";
import {
    bancoDoPagador,
    emailDoPagamento,
    ehPagamentoTeste,
    metodoDoPagamento,
    nomeDoPagador,
    sincronizarFinanceiroDoPagamento,
} from "./mercadoPago.service.js";
import { statusRifaDoPagamento } from "./rifa.service.js";
import { enviarEmailConfirmacaoPedido } from "./email.service.js";

type Pagamento = Awaited<ReturnType<typeof buscarPagamento>>;

const UUID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_MS = 60_000;
const DIA_MS = 24 * 60 * MIN_MS;
const ABERTOS: RifaTypes.StatusPedido[] = ["RESERVADO", "AGUARDANDO_PAGAMENTO"];
const PAGOS: RifaTypes.StatusPedido[] = ["PAGO", "PAGO_PARCIAL"];

const pad = (n: number) => String(n).padStart(3, "0");

/** paymentId de cada número do pedido: único e o mesmo em toda tentativa (idempotência). */
export const idNumeroPedido = (pedidoId: string, numero: number) => `PEDIDO-${pedidoId}-${pad(numero)}`;

/** O IP nunca é guardado: só um hash com sal, para limitar reservas por pessoa. */
export const hashIp = (ip: string | undefined): string | null =>
    ip ? createHash("sha256").update(`${process.env.IP_HASH_SALT ?? ""}:${ip}`).digest("hex") : null;

function validarReservaId(valor: unknown): string {
    if (typeof valor !== "string" || !UUID_VALIDO.test(valor)) {
        throw new InvalidIdError("reservaId inválido.");
    }
    return valor.toLowerCase();
}

/** De 1 a 10 inteiros entre 1 e 500, sem repetição. Só aceita número (nada de objeto/texto). */
export function validarNumerosPedido(valor: unknown): number[] {
    if (!Array.isArray(valor) || valor.length === 0) {
        throw new MissingParamsError("Escolha pelo menos um número.");
    }
    if (valor.length > RifaTypes.MAX_NUMEROS_POR_PEDIDO) {
        throw new MissingParamsError(`Dá pra reservar até ${RifaTypes.MAX_NUMEROS_POR_PEDIDO} números por compra.`);
    }
    const numeros = valor.map((v) => (typeof v === "number" ? v : NaN));
    if (numeros.some((n) => !Number.isInteger(n) || n < 1 || n > RifaTypes.TOTAL_NUMEROS)) {
        throw new MissingParamsError(`Os números vão de 1 a ${RifaTypes.TOTAL_NUMEROS}.`);
    }
    if (new Set(numeros).size !== numeros.length) {
        throw new MissingParamsError("Tem número repetido na reserva.");
    }
    return [...numeros].sort((a, b) => a - b);
}

export interface ContatoPedido {
    nome: string;
    email: string;
    phone: string;
}

/** Nome, e-mail e WhatsApp de quem compra, e o aceite dos termos (LGPD). */
export function validarContato(corpo: Record<string, unknown> | undefined): ContatoPedido {
    const nome = typeof corpo?.nome === "string" ? corpo.nome.trim().replace(/\s+/g, " ") : "";
    if (nome.length < 3 || nome.length > 120) {
        throw new MissingParamsError("Informe seu nome completo.");
    }

    const email = validarEmailPix(corpo?.email).toLowerCase();

    const phone = typeof corpo?.phone === "string" ? corpo.phone.trim() : "";
    const digitos = phone.replace(/\D/g, "");
    if (phone.length > 30 || digitos.length < 10 || digitos.length > 13) {
        throw new MissingParamsError("Informe um WhatsApp válido, com DDD.");
    }

    if (corpo?.aceiteTermos !== true) {
        throw new MissingParamsError("Para continuar, aceite o Regulamento e a Política de Privacidade.");
    }

    return { nome, email, phone: digitos };
}

function origemValidada(origem: UtmMetadata) {
    const normalizada = normalizarParametros(origem);
    validarParametros(normalizada.utmSource as UtmSource | null, normalizada.utmMedium as UtmMedium | null, null);
    return { utmSource: normalizada.utmSource ?? null, utmMedium: normalizada.utmMedium ?? null };
}

// ---------- Resumo devolvido ao navegador (sem dados pessoais) ----------

export interface ResumoPedido {
    reservaId: string;
    status: RifaTypes.StatusPedido;
    numeros: number[];
    numerosConfirmados: number[];
    numerosAEscolher: number;
    /** Links para escolher os números que se perderam (PAGO_PARCIAL). */
    linksEscolha: string[];
    valor: number;
    expiraEm: string;
    teste: boolean;
    pagamento: {
        metodo: "pix" | "cartao";
        expiraEm: string;
        paymentId: string | null;
        rastreioId: string | null;
        qrCode: string | null;
        qrCodeBase64: string | null;
        initPoint: string | null;
    } | null;
}

async function linksEscolha(pedidoId: string): Promise<string[]> {
    const aEscolher = await Rifa.find(
        { pedidoId, status: "APROVADO" satisfies RifaTypes.StatusRifaType, claimedNumber: null },
        { paymentId: 1 }
    ).sort({ paymentId: 1 }).lean();
    return aEscolher.map((d) => `/rifa/pagamento-aprovado?payment_id=${encodeURIComponent(d.paymentId)}`);
}

export async function resumoPedido(pedido: IPedido, agora = new Date()): Promise<ResumoPedido> {
    const vencido = ABERTOS.includes(pedido.status) && pedido.expiraEm.getTime() <= agora.getTime();
    const p = pedido.pagamento;
    return {
        reservaId: pedido._id,
        status: vencido ? "EXPIRADO" : pedido.status,
        numeros: pedido.numeros,
        numerosConfirmados: pedido.numerosConfirmados,
        numerosAEscolher: pedido.numerosAEscolher,
        linksEscolha: pedido.status === "PAGO_PARCIAL" ? await linksEscolha(pedido._id) : [],
        valor: pedido.valor,
        expiraEm: pedido.expiraEm.toISOString(),
        teste: Boolean(pedido.teste),
        pagamento: p && !vencido && !PAGOS.includes(pedido.status) ? {
            metodo: p.metodo,
            expiraEm: p.expiraEm.toISOString(),
            paymentId: p.mpPaymentId,
            rastreioId: p.rastreioId,
            qrCode: p.qrCode ?? null,
            qrCodeBase64: p.qrCodeBase64 ?? null,
            initPoint: p.initPoint ?? null,
        } : null,
    };
}

// ---------- Reservar ----------

interface ReservarArgs {
    numeros: unknown;
    origem?: UtmMetadata;
    ip?: string;
    /** Reserva de teste (header x-pix-teste válido): não bloqueia números reais. */
    teste?: boolean;
}

/**
 * Reserva os números por RESERVA_ESCOLHA_MIN minutos.
 *
 * Proteção contra corrida: cada número vira um documento RESERVADO na
 * coleção rifas, e o índice único { claimedNumber, teste } decide quem fica
 * com ele — o mesmo índice que protege a escolha do fluxo antigo, o sorteio e
 * o cadastro manual do painel. Se duas pessoas tentam o mesmo número ao mesmo
 * tempo, só um insert passa; o outro recebe E11000 e o número volta como
 * indisponível. Reserva vencida conta como livre e é apagada antes do insert.
 */
export async function reservarNumeros({ numeros, origem = {}, ip, teste = false }: ReservarArgs): Promise<ResponseType> {

    const pedidos = validarNumerosPedido(numeros);
    const { utmSource, utmMedium } = origemValidada(origem);
    const ipHash = hashIp(ip);
    const agora = new Date();

    if (!teste && ipHash) {
        const abertas = await Pedido.countDocuments({ ipHash, status: { $in: ABERTOS }, expiraEm: { $gt: agora } });
        if (abertas >= RifaTypes.MAX_RESERVAS_ATIVAS_POR_IP) {
            throw new TooManyRequestsError(
                "Você já tem reservas abertas. Pague ou libere uma delas antes de reservar outros números."
            );
        }
    }

    // Vagas: os 500 menos tudo que ocupa lugar — números vendidos, reservas
    // ativas e pagamentos do fluxo antigo que ainda vão escolher um número.
    let tentar = pedidos;
    let semVaga: number[] = [];
    if (!teste) {
        const ocupadas = await Rifa.countDocuments({
            teste: { $ne: true },
            status: { $ne: "CANCELADO" satisfies RifaTypes.StatusRifaType },
            ...semReservaVencida(agora),
        });
        const vagas = Math.max(0, RifaTypes.TOTAL_NUMEROS - ocupadas);
        if (vagas === 0) {
            throw new ConflictError("Os números desta ação já foram todos vendidos.", { indisponiveis: pedidos });
        }
        if (pedidos.length > vagas) {
            tentar = pedidos.slice(0, vagas);
            semVaga = pedidos.slice(vagas);
        }
    }

    await Rifa.deleteMany({
        claimedNumber: { $in: tentar },
        status: "RESERVADO" satisfies RifaTypes.StatusRifaType,
        reservaExpiraEm: { $lte: agora },
        teste: teste ? true : { $ne: true },
    });

    const pedidoId = randomUUID();
    const expiraEm = new Date(agora.getTime() + RifaTypes.RESERVA_ESCOLHA_MIN * MIN_MS);

    await Pedido.create({
        _id: pedidoId,
        status: "RESERVADO",
        numeros: [],
        valor: 0,
        expiraEm,
        utmSource,
        utmMedium,
        ipHash,
        ...(teste ? { teste: true } : {}),
    });

    const resultados = await Promise.allSettled(tentar.map((numero) => Rifa.create({
        paymentId: idNumeroPedido(pedidoId, numero),
        status: "RESERVADO",
        amount: RifaTypes.TICKET_PRICE_BRL,
        claimedNumber: numero,
        pedidoId,
        reservaExpiraEm: expiraEm,
        utmSource,
        utmMedium,
        utmCampaign: "RIFA_SOLIDARIA",
        // Só true é gravado: ver o índice único em models/Rifa.ts.
        ...(teste ? { teste: true } : {}),
    })));

    const reservados: number[] = [];
    const indisponiveis: number[] = [...semVaga];
    let erroInesperado: unknown = null;
    resultados.forEach((r, i) => {
        if (r.status === "fulfilled") reservados.push(tentar[i]!);
        else if ((r.reason as any)?.code === 11000) indisponiveis.push(tentar[i]!);
        else erroInesperado = r.reason;
    });

    if (erroInesperado || reservados.length === 0) {
        await Rifa.deleteMany({ pedidoId, status: "RESERVADO" });
        await Pedido.deleteOne({ _id: pedidoId });
        if (erroInesperado) throw erroInesperado;
        throw new ConflictError("Esses números acabaram de ganhar dono. Escolhe outros?", {
            indisponiveis: indisponiveis.sort((a, b) => a - b),
        });
    }

    reservados.sort((a, b) => a - b);
    const valor = reservados.length * RifaTypes.TICKET_PRICE_BRL;
    await Pedido.updateOne({ _id: pedidoId }, { $set: { numeros: reservados, valor } });

    return {
        status: 201,
        message: "Números reservados.",
        data: {
            reservaId: pedidoId,
            numeros: reservados,
            indisponiveis: indisponiveis.sort((a, b) => a - b),
            expiraEm: expiraEm.toISOString(),
            valor,
            teste,
        },
    };
}

// ---------- Consultar / liberar ----------

export async function buscarReserva(reservaId: unknown): Promise<ResponseType> {
    const id = validarReservaId(reservaId);
    const pedido = await Pedido.findById(id).lean();
    if (!pedido) throw new NotFoundError("Reserva não encontrada.");
    return { status: 200, message: "Reserva.", data: await resumoPedido(pedido) };
}

/**
 * Encerra o pagamento que já existia na reserva antes de outro ser gerado
 * (ou de liberar): cancela o Pix pendente e faz o link do cartão parar de
 * aceitar pagamento. Se o Pix já tiver sido pago, confirma a compra e avisa.
 */
async function encerrarPagamentoAnterior(pedido: IPedido): Promise<void> {
    const anterior = pedido.pagamento;
    if (!anterior) return;

    if (anterior.metodo === "pix" && anterior.mpPaymentId) {
        try {
            await mercadoPagoPedidoClient.cancelarPagamento(anterior.mpPaymentId);
        } catch (err) {
            const pagamento = await buscarPagamento(anterior.mpPaymentId).catch(() => null);
            if (pagamento?.status === "approved") {
                await processarPagamentoPedido(pagamento);
                throw new ConflictError("Seu Pix anterior já foi pago: seus números estão garantidos.", { status: "PAGO" });
            }
            // Já cancelado/vencido: nada a fazer. Outro erro: segue, e um
            // pagamento em dobro vira alerta no painel (PAGAMENTO_DUPLICADO).
            if (!pagamento || !["cancelled", "rejected", "refunded"].includes(pagamento.status ?? "")) {
                console.error("[pedido] não foi possível cancelar o Pix anterior", anterior.mpPaymentId, err);
            }
        }
    }

    if (anterior.metodo === "cartao" && anterior.preferenceId) {
        await mercadoPagoPedidoClient.expirarPreferencia(anterior.preferenceId).catch((err) =>
            console.error("[pedido] não foi possível expirar o link do cartão", anterior.preferenceId, err)
        );
    }
}

/** Devolve os números ao quadro (trocar números ou desistir). */
export async function liberarReserva(reservaId: unknown): Promise<ResponseType> {
    const id = validarReservaId(reservaId);
    const pedido = await Pedido.findById(id).lean();
    if (!pedido) throw new NotFoundError("Reserva não encontrada.");

    if (PAGOS.includes(pedido.status)) {
        throw new ConflictError("Essa compra já foi paga: os números são seus.", { status: pedido.status });
    }

    if (ABERTOS.includes(pedido.status)) {
        await encerrarPagamentoAnterior(pedido);

        const atualizado = await Pedido.findOneAndUpdate(
            { _id: id, status: { $in: ABERTOS } },
            { $set: { status: "CANCELADO" } },
            { returnDocument: "after" }
        ).lean();

        if (!atualizado) {
            const agora = await Pedido.findById(id).lean();
            if (agora && PAGOS.includes(agora.status)) {
                throw new ConflictError("Essa compra já foi paga: os números são seus.", { status: agora.status });
            }
        }
    }

    await Rifa.deleteMany({ pedidoId: id, status: "RESERVADO" });
    return { status: 200, message: "Números liberados.", data: { reservaId: id, status: "CANCELADO" } };
}

// ---------- Gerar o pagamento (Pix ou cartão) ----------

interface CriarPagamentoArgs {
    reservaId: unknown;
    metodo: "pix" | "cartao";
    corpo: Record<string, unknown> | undefined;
}

/**
 * Gera o Pix ou o link do cartão do valor total da reserva. Os dois expiram
 * no mesmo instante (agora + PAGAMENTO_EXPIRACAO_MIN), e a reserva passa a
 * valer até esse instante + RESERVA_FOLGA_MIN. Só um pagamento fica ativo por
 * reserva: gerar outro cancela o anterior.
 */
export async function criarPagamentoPedido({ reservaId, metodo, corpo }: CriarPagamentoArgs): Promise<ResponseType> {

    const id = validarReservaId(reservaId);
    const contato = validarContato(corpo);
    const agora = new Date();

    const atual = await Pedido.findById(id).lean();
    if (!atual) throw new NotFoundError("Reserva não encontrada.");
    if (PAGOS.includes(atual.status)) {
        throw new ConflictError("Essa compra já foi paga: os números são seus.", { status: atual.status });
    }
    if (!ABERTOS.includes(atual.status) || atual.expiraEm.getTime() <= agora.getTime()) {
        throw new GoneError("Sua reserva venceu e os números voltaram pro quadro. Escolha de novo.");
    }
    if (atual.tentativas >= RifaTypes.MAX_TENTATIVAS_PAGAMENTO) {
        throw new TooManyRequestsError("Essa reserva já gerou pagamentos demais. Escolha os números de novo.");
    }
    if (metodo === "cartao" && atual.teste) {
        throw new MissingParamsError("O modo teste só funciona no Pix.");
    }

    // Trava: tentativas funciona como versão — dois cliques ao mesmo tempo
    // não geram dois pagamentos.
    const pedido = await Pedido.findOneAndUpdate(
        { _id: id, status: { $in: ABERTOS }, expiraEm: { $gt: agora }, tentativas: atual.tentativas },
        {
            $set: {
                status: "AGUARDANDO_PAGAMENTO",
                nome: contato.nome,
                email: contato.email,
                phone: contato.phone,
                consentimento: { versao: RifaTypes.VERSAO_TERMOS, em: agora },
            },
            $inc: { tentativas: 1 },
        },
        { returnDocument: "after" }
    ).lean();
    if (!pedido) throw new ConflictError("Já estamos gerando um pagamento pra essa reserva. Aguarde um instante.");

    const expiraPagamento = new Date(agora.getTime() + RifaTypes.PAGAMENTO_EXPIRACAO_MIN * MIN_MS);
    const reservaAte = new Date(expiraPagamento.getTime() + RifaTypes.RESERVA_FOLGA_MIN * MIN_MS);

    // Estende a reserva ANTES de falar com o Mercado Pago: assim ela não vence
    // durante a chamada. Se algum número já não estiver guardado, a reserva
    // não vale mais.
    const { modifiedCount } = await Rifa.updateMany(
        { pedidoId: id, status: "RESERVADO", reservaExpiraEm: { $gt: agora } },
        { $set: { reservaExpiraEm: reservaAte } }
    );
    if (modifiedCount !== pedido.numeros.length) {
        await Pedido.updateOne({ _id: id }, { $set: { status: "EXPIRADO" } });
        await Rifa.deleteMany({ pedidoId: id, status: "RESERVADO" });
        throw new GoneError("Sua reserva venceu e os números voltaram pro quadro. Escolha de novo.");
    }

    const voltarReserva = async () => {
        await Rifa.updateMany({ pedidoId: id, status: "RESERVADO" }, { $set: { reservaExpiraEm: pedido.expiraEm } });
        await Pedido.updateOne({ _id: id }, { $set: { pagamento: null } });
    };

    try {
        await encerrarPagamentoAnterior(atual);
    } catch (err) {
        if (!(err instanceof ConflictError)) await voltarReserva();
        throw err;
    }

    const dados: DadosPagamentoPedido = {
        pedidoId: id,
        numeros: pedido.numeros,
        valor: pedido.valor,
        expiraEm: expiraPagamento,
        email: contato.email,
        nome: contato.nome,
        origem: { utmSource: pedido.utmSource, utmMedium: pedido.utmMedium },
        teste: Boolean(pedido.teste),
    };

    let pagamento: PagamentoPedido;
    try {
        if (metodo === "pix") {
            const pix = await mercadoPagoPedidoClient.criarPix(dados);
            const qrCode = pix?.point_of_interaction?.transaction_data?.qr_code;
            const qrCodeBase64 = pix?.point_of_interaction?.transaction_data?.qr_code_base64;
            if (!pix?.id || !qrCode || !qrCodeBase64) throw new Error("O Mercado Pago não devolveu o QR code do Pix.");
            pagamento = {
                mpPaymentId: String(pix.id),
                preferenceId: null,
                metodo: "pix",
                rastreioId: pix.external_reference ?? null,
                expiraEm: expiraPagamento,
                qrCode,
                qrCodeBase64,
                initPoint: null,
                criadoEm: agora,
            };
        } else {
            const preferencia = await mercadoPagoPedidoClient.criarPreferencia(dados);
            if (!preferencia?.init_point) throw new Error("O Mercado Pago não devolveu o link do cartão.");
            pagamento = {
                mpPaymentId: null,
                preferenceId: preferencia.id ?? null,
                metodo: "cartao",
                rastreioId: null,
                expiraEm: expiraPagamento,
                initPoint: preferencia.init_point,
                criadoEm: agora,
            };
        }
    } catch (err) {
        console.error(`[pedido] falha ao criar ${metodo}`, id, err);
        await voltarReserva();
        throw err;
    }

    await Pedido.updateOne({ _id: id }, { $set: { pagamento, expiraEm: reservaAte } });

    if (metodo === "pix") {
        return {
            status: 201,
            message: "Pix criado com sucesso.",
            data: {
                reservaId: id,
                paymentId: pagamento.mpPaymentId,
                rastreioId: pagamento.rastreioId,
                qrCode: pagamento.qrCode,
                qrCodeBase64: pagamento.qrCodeBase64,
                expiraEm: expiraPagamento.toISOString(),
                valor: pedido.teste ? RifaTypes.VALOR_PIX_TESTE_BRL : pedido.valor,
                teste: Boolean(pedido.teste),
                numeros: pedido.numeros,
            },
        };
    }

    return {
        status: 201,
        message: "Link do cartão criado.",
        data: { reservaId: id, initPoint: pagamento.initPoint, expiraEm: expiraPagamento.toISOString(), valor: pedido.valor },
    };
}

// ---------- Confirmar o pagamento ----------

/**
 * Confirma os números de um pedido pago. Chamado pelo webhook, pela consulta
 * do Pix e pela volta do cartão — os três ao mesmo tempo não confirmam nada
 * em dobro:
 * 1. converte os números ainda RESERVADO em APROVADO (updateMany é idempotente);
 * 2. número que se perdeu (a reserva venceu e alguém pegou): tenta de novo e,
 *    se já tem dono, vira um "a escolher" — APROVADO sem número, com o mesmo
 *    paymentId determinístico, que segue o fluxo antigo (link, lembretes,
 *    sorteio no fim do prazo);
 * 3. só quem muda o pedido para PAGO manda o e-mail.
 * O valor pago precisa ser o do pedido; um segundo pagamento aprovado vira
 * alerta para estorno.
 */
export async function processarPagamentoPedido(pagamento: Pagamento): Promise<ResumoPedido | null> {

    const pedidoId = String(pagamento.metadata?.pedido_id ?? "");
    const mpPaymentId = String(pagamento.id);
    if (!UUID_VALIDO.test(pedidoId)) return null;

    const pedido = await Pedido.findById(pedidoId).lean();
    if (!pedido) {
        console.error("[pedido] pagamento de um pedido que não existe", mpPaymentId, pedidoId);
        return null;
    }

    if (statusRifaDoPagamento(pagamento) !== "APROVADO") return resumoPedido(pedido);

    const esperado = pedido.teste ? RifaTypes.VALOR_PIX_TESTE_BRL : pedido.valor;
    const pago = Number(pagamento.transaction_amount ?? 0);
    if (ehPagamentoTeste(pagamento) !== Boolean(pedido.teste) || Math.abs(pago - esperado) > 0.001) {
        console.error("[pedido] valor pago diferente do pedido", mpPaymentId, pedidoId, pago, esperado);
        await Pedido.updateOne({ _id: pedidoId }, { $addToSet: { alertas: "VALOR_DIVERGENTE" } });
        return resumoPedido(pedido);
    }

    if (PAGOS.includes(pedido.status)) {
        if (pedido.pagoPor && pedido.pagoPor !== mpPaymentId) {
            await Pedido.updateOne(
                { _id: pedidoId, "pagamentosExtras.mpPaymentId": { $ne: mpPaymentId } },
                {
                    $push: { pagamentosExtras: { mpPaymentId, valor: pago, em: new Date() } },
                    $addToSet: { alertas: "PAGAMENTO_DUPLICADO" },
                }
            );
            console.error("[pedido] pagamento em dobro (estornar)", mpPaymentId, pedidoId);
        }
        return resumoPedido((await Pedido.findById(pedidoId).lean())!);
    }

    const dataPagamento = pagamento.date_approved ? new Date(pagamento.date_approved) : new Date();
    const dados = {
        name: pedido.nome ?? nomeDoPagador(pagamento),
        email: pedido.email ?? emailDoPagamento(pagamento),
        phone: pedido.phone,
        mpPaymentId,
        aprovadoEm: new Date(),
        nomePagador: nomeDoPagador(pagamento),
        bancoPagador: bancoDoPagador(pagamento),
        metodoPagamento: metodoDoPagamento(pagamento),
        dataPagamento,
    };

    // 1. reservas ainda guardadas viram compra
    await Rifa.updateMany(
        { pedidoId, status: "RESERVADO" },
        { $set: { status: "APROVADO", reservaExpiraEm: null, ...dados } }
    );

    // 2. números que se perderam
    const existentes = new Set(
        (await Rifa.find({ pedidoId }, { paymentId: 1 }).lean()).map((d) => d.paymentId)
    );
    const base = {
        status: "APROVADO" as const,
        amount: RifaTypes.TICKET_PRICE_BRL,
        pedidoId,
        utmSource: pedido.utmSource,
        utmMedium: pedido.utmMedium,
        utmCampaign: "RIFA_SOLIDARIA",
        ...dados,
        ...(pedido.teste ? { teste: true } : {}),
    };
    for (const numero of pedido.numeros) {
        const paymentId = idNumeroPedido(pedidoId, numero);
        if (existentes.has(paymentId)) continue;
        try {
            await Rifa.create({ ...base, paymentId, claimedNumber: numero });
        } catch (err: any) {
            if (err?.code !== 11000) throw err;
            if (err?.keyPattern?.paymentId) continue; // outro processamento já criou
            try {
                await Rifa.create({ ...base, paymentId, claimedNumber: null });
            } catch (err2: any) {
                if (err2?.code !== 11000) throw err2;
            }
        }
    }

    // 3. fecha o pedido
    const finais = await Rifa.find({ pedidoId, status: "APROVADO" }, { claimedNumber: 1 }).lean();
    const numerosConfirmados = finais
        .map((d) => d.claimedNumber)
        .filter((n): n is number => typeof n === "number")
        .sort((a, b) => a - b);
    const numerosAEscolher = finais.length - numerosConfirmados.length;
    const foraDoPrazo = ["EXPIRADO", "CANCELADO"].includes(pedido.status) || numerosAEscolher > 0;

    const marcado = await Pedido.findOneAndUpdate(
        { _id: pedidoId, status: { $nin: PAGOS } },
        {
            $set: {
                status: numerosAEscolher > 0 ? "PAGO_PARCIAL" : "PAGO",
                numerosConfirmados,
                numerosAEscolher,
                pagoPor: mpPaymentId,
                pagoEm: dataPagamento,
                ...(!pedido.email && dados.email ? { email: dados.email } : {}),
            },
            ...(foraDoPrazo ? { $addToSet: { alertas: "PAGO_APOS_EXPIRAR" } } : {}),
        },
        { returnDocument: "after" }
    ).lean();

    if (marcado) {
        console.info("[pedido] pago", pedidoId, mpPaymentId, numerosConfirmados.map(pad).join(","));
        if (dados.email) {
            const links = numerosAEscolher > 0 ? await linksEscolha(pedidoId) : [];
            void enviarEmailConfirmacaoPedido({
                name: dados.name ?? "participante",
                email: dados.email,
                numeros: numerosConfirmados,
                linksEscolha: links.map((l) => `${process.env.FRONTEND_URL ?? ""}${l}`),
                teste: Boolean(pedido.teste),
            });
        }
    }

    return resumoPedido(marcado ?? (await Pedido.findById(pedidoId).lean())!);
}

/**
 * Volta do cartão (e consulta da página de retorno): confere o pagamento no
 * Mercado Pago — o webhook pode atrasar — e devolve o estado da compra.
 * ref é o pedido (external_reference); sem ele não dá pra consultar.
 */
export async function consultarCompra(paymentId: unknown, ref: unknown): Promise<ResponseType> {
    const id = validarReservaId(ref);
    const pedido = await Pedido.findById(id).lean();
    if (!pedido) throw new NotFoundError("Compra não encontrada.");

    if (paymentId === undefined || paymentId === null || paymentId === "" || paymentId === "null") {
        return { status: 200, message: "Compra.", data: { ...(await resumoPedido(pedido)), statusPagamento: null } };
    }

    if (typeof paymentId !== "string" || !/^\d{1,20}$/.test(paymentId)) {
        throw new InvalidIdError("payment_id inválido.");
    }

    let pagamento: Pagamento;
    try {
        pagamento = await buscarPagamento(paymentId);
    } catch (error: any) {
        if (error?.status === 404) throw new NotFoundError("Pagamento não encontrado.");
        throw error;
    }
    if (String(pagamento.metadata?.pedido_id ?? "") !== id) {
        throw new NotFoundError("Pagamento não encontrado.");
    }

    const statusPagamento = statusRifaDoPagamento(pagamento);
    const resumo = await processarPagamentoPedido(pagamento);
    if (statusPagamento !== "PENDENTE") {
        await sincronizarFinanceiroDoPagamento(pagamento, statusPagamento).catch((err) =>
            console.error("[compra] falha ao sincronizar painel", paymentId, err)
        );
    }

    return { status: 200, message: "Compra.", data: { ...(resumo ?? (await resumoPedido(pedido))), statusPagamento } };
}

// ---------- Tarefas (no uso do site e no cron diário) ----------

export interface ResultadoTarefasPedidos {
    expirados: number;
    reservasApagadas: number;
    anonimizados: number;
}

/**
 * Pedidos vencidos sem pagamento viram EXPIRADO, reservas vencidas são
 * apagadas (o índice TTL também faz isso) e, depois de
 * RETENCAO_PEDIDO_NAO_PAGO_DIAS, os dados pessoais de quem não pagou são
 * apagados (LGPD: só guardamos o necessário, pelo tempo necessário).
 */
export async function tarefasDosPedidos(agora = new Date()): Promise<ResultadoTarefasPedidos> {
    const expirados = await Pedido.updateMany(
        { status: { $in: ABERTOS }, expiraEm: { $lte: agora } },
        { $set: { status: "EXPIRADO" } }
    );
    const reservas = await Rifa.deleteMany({ status: "RESERVADO", reservaExpiraEm: { $lte: agora } });

    const limite = new Date(agora.getTime() - RifaTypes.RETENCAO_PEDIDO_NAO_PAGO_DIAS * DIA_MS);
    const filtro: QueryFilter<IPedido> = {
        status: { $in: ["EXPIRADO", "CANCELADO"] },
        atualizadoEm: { $lte: limite },
        anonimizadoEm: null,
    };
    await Pedido.updateMany(
        { ...filtro, pagamento: { $ne: null } },
        { $set: { "pagamento.qrCode": null, "pagamento.qrCodeBase64": null } },
        { timestamps: false }
    );
    const anonimizados = await Pedido.updateMany(
        filtro,
        { $set: { nome: null, email: null, phone: null, ipHash: null, anonimizadoEm: agora } },
        { timestamps: false }
    );

    return {
        expirados: expirados.modifiedCount,
        reservasApagadas: reservas.deletedCount,
        anonimizados: anonimizados.modifiedCount,
    };
}

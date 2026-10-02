import Rifa, { type IRifa } from "../models/Rifa.js";
import { ConflictError, NotFoundError } from "../utils/errors.js";
import {
    normalizarDadosCriacaoRifa,
    validarCriacaoRifa,
    normalizarDadosConfirmacaoRifa,
    validarConfirmacaoRifa,
} from "../utils/rifavalidar.js";
import type ResponseType from "../types/response.type.js";
import { enviarEmailConfirmacao } from "./email.service.js";


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
    dadosBase: Partial<Omit<IRifa, "paymentId">>
): Promise<void> => {
    try {
        await registrarPagamentoRifa(paymentId, dadosBase);
    } catch (error) {
        if (!(error instanceof ConflictError)) throw error;

        await Rifa.updateOne(
            { paymentId },
            { $set: { status: dadosBase.status } },
            { runValidators: true }
        );

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

        const rifas = await Rifa.find({ claimedNumber: { $ne: null } }).distinct("claimedNumber");
        return { status: 200, message: "Rifas encontradas.", data: rifas };

    } catch (error: any) {

        console.error("getAllRifasService error:", error);
        throw error;
    }
};
import { randomInt } from "node:crypto";
import Rifa from "../models/Rifa.js";
import * as RifaTypes from "../types/rifa.types.js";
import { enviarEmailConfirmacao, enviarEmailEscolhaNumero } from "./email.service.js";

const DIA_MS = 24 * 60 * 60_000;

/** Dias que a pessoa tem para escolher o número depois do pagamento aprovado. */
export const PRAZO_ESCOLHA_DIAS = 20;

/** Lembretes por dias restantes do prazo; o de 1 sai no último dia. */
export const MARCOS_LEMBRETE = [20, 15, 10, 5, 1] as const;

/**
 * O primeiro lembrete espera um pouco: logo depois de aprovar, a pessoa
 * normalmente ainda está na tela escolhendo o número.
 */
export const CARENCIA_PRIMEIRO_LEMBRETE_MS = 60 * 60_000;

const TENTATIVAS_SORTEIO = 5;

export interface ResultadoEscolhas {
    lembretes: { paymentId: string; marco: number; enviado: boolean }[];
    sorteados: { paymentId: string; claimedNumber: number }[];
}

/**
 * Sorteia um número livre para um pagamento APROVADO que não escolheu no
 * prazo e envia o e-mail de confirmação. Os números de teste e os reais são
 * conjuntos separados (mesmo critério do índice único em models/Rifa.ts).
 * Devolve o número, ou null se não havia o que sortear.
 */
export async function sortearNumeroRifa(paymentId: string): Promise<number | null> {
    for (let tentativa = 0; tentativa < TENTATIVAS_SORTEIO; tentativa++) {
        const registro = await Rifa.findOne({
            paymentId,
            status: "APROVADO" satisfies RifaTypes.StatusRifaType,
            claimedNumber: null,
        }).lean();
        if (!registro) return null;

        const ocupados = new Set<number>(await Rifa.distinct("claimedNumber", {
            claimedNumber: { $ne: null },
            teste: registro.teste ? true : { $ne: true },
        }));

        const livres: number[] = [];
        for (let n = 1; n <= RifaTypes.TOTAL_NUMEROS; n++) if (!ocupados.has(n)) livres.push(n);

        if (livres.length === 0) {
            console.error("[sorteio rifa] nenhum número livre para", paymentId);
            return null;
        }

        const numero = livres[randomInt(livres.length)]!;

        try {
            // claimedNumber: null no filtro — mesma proteção de corrida do
            // confirmarNumeroRifa: se a pessoa escolheu agora, nada muda.
            const atualizado = await Rifa.findOneAndUpdate(
                { paymentId, claimedNumber: null },
                { $set: { claimedNumber: numero } },
                { new: true }
            );
            if (!atualizado) return null;

            if (atualizado.email) {
                await enviarEmailConfirmacao({
                    name: atualizado.name ?? "participante",
                    email: atualizado.email,
                    claimedNumber: numero,
                    sorteado: true,
                    teste: atualizado.teste,
                });
            }

            console.info("[sorteio rifa] número sorteado", paymentId, numero);
            return numero;
        } catch (error: any) {
            // Alguém pegou o mesmo número no meio do caminho: sorteia de novo.
            if (error?.code === 11000) continue;
            throw error;
        }
    }

    console.error("[sorteio rifa] não foi possível sortear depois de várias tentativas", paymentId);
    return null;
}

/**
 * Pagamentos APROVADO sem número: manda o lembrete devido (20, 15, 10, 5 e
 * 1 dia antes do fim do prazo) e, vencido o prazo, sorteia o número.
 * Só o lembrete mais recente sai — se as execuções pararam uns dias, a
 * pessoa não recebe uma rajada de e-mails. `limite` é o máximo de e-mails
 * ou sorteios por execução. Nunca lança erro.
 */
export async function processarEscolhasPendentes(
    { limite, agora = new Date() }: { limite: number; agora?: Date }
): Promise<ResultadoEscolhas> {

    const resultado: ResultadoEscolhas = { lembretes: [], sorteados: [] };

    try {
        // Aprovados de antes desta funcionalidade não têm aprovadoEm: o prazo
        // deles começa agora.
        await Rifa.updateMany(
            { status: "APROVADO" satisfies RifaTypes.StatusRifaType, claimedNumber: null, aprovadoEm: null },
            { $set: { aprovadoEm: agora } }
        );

        const pendentes = await Rifa.find(
            { status: "APROVADO" satisfies RifaTypes.StatusRifaType, claimedNumber: null },
            { paymentId: 1, email: 1, aprovadoEm: 1, lembretesEnviados: 1, teste: 1 }
        ).sort({ aprovadoEm: 1 }).lean();

        let acoes = 0;

        for (const registro of pendentes) {
            if (acoes >= limite) break;

            const aprovadoEm = registro.aprovadoEm ?? agora;
            const prazo = new Date(aprovadoEm.getTime() + PRAZO_ESCOLHA_DIAS * DIA_MS);
            const restanteMs = prazo.getTime() - agora.getTime();

            try {
                if (restanteMs <= 0) {
                    acoes++;
                    const numero = await sortearNumeroRifa(registro.paymentId);
                    if (numero !== null) resultado.sorteados.push({ paymentId: registro.paymentId, claimedNumber: numero });
                    continue;
                }

                if (!registro.email) continue;
                if (agora.getTime() - aprovadoEm.getTime() < CARENCIA_PRIMEIRO_LEMBRETE_MS) continue;

                const devidos = MARCOS_LEMBRETE.filter((m) => restanteMs <= m * DIA_MS);
                const marco = Math.min(...devidos);
                if ((registro.lembretesEnviados ?? []).includes(marco)) continue;

                // Reserva o marco antes de enviar: duas execuções ao mesmo
                // tempo nunca mandam o mesmo lembrete. Os marcos anteriores
                // que ficaram para trás contam como enviados.
                const { modifiedCount } = await Rifa.updateOne(
                    { _id: registro._id, claimedNumber: null, lembretesEnviados: { $ne: marco } },
                    { $addToSet: { lembretesEnviados: { $each: devidos } } }
                );
                if (modifiedCount === 0) continue;

                acoes++;
                const enviado = await enviarEmailEscolhaNumero({
                    email: registro.email,
                    paymentId: registro.paymentId,
                    diasRestantes: Math.ceil(restanteMs / DIA_MS),
                    prazo,
                    teste: registro.teste,
                });
                resultado.lembretes.push({ paymentId: registro.paymentId, marco, enviado });
            } catch (err) {
                console.error("[lembretes rifa] falha ao processar", registro.paymentId, err);
            }
        }
    } catch (err) {
        console.error("[lembretes rifa] falha ao buscar pagamentos sem número", err);
    }

    return resultado;
}

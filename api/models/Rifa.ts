import mongoose, { Schema, model, Model } from "mongoose";
import * as RifaTypes from "../types/rifa.types.js";

export interface IRifa {
    paymentId: string;
    status: RifaTypes.StatusRifaType;
    amount: number;

    // Nulos até o participante confirmar o número.
    name: string | null;
    phone: string | null;
    email: string | null;

    claimedNumber: number | null;

    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;

    // Início do prazo de escolha do número (lembretes e sorteio).
    aprovadoEm: Date | null;
    // Marcos de lembrete já enviados (dias restantes: 20, 15, 10, 5, 1).
    lembretesEnviados: number[];
    // Contato de quem pagou, para quando o e-mail não vier (no Pix o MP
    // devolve o e-mail mascarado): nome do pagador ou titular do cartão, banco
    // de origem do Pix, meio de pagamento (pix, cartao...) e quando foi pago —
    // o que ajuda a achar o pagamento no extrato.
    nomePagador?: string | null;
    bancoPagador?: string | null;
    metodoPagamento?: string | null;
    dataPagamento?: Date | null;
    // Quando as tarefas buscaram o contato no MP (não busca de novo).
    contatoConferidoEm?: Date | null;

    // Pix de teste de R$ 0,01: não ocupa vaga nem número real. Só é gravado
    // quando true (ver o índice abaixo).
    teste?: boolean;
}

const RifaSchema: Schema<IRifa> = new mongoose.Schema({
    paymentId: { type: String, required: true, unique: true },
    status: { type: String, enum: RifaTypes.STATUSRIFATYPE, required: true },
    amount: { type: Number, required: true },

    name: { type: String, default: null },
    phone: { type: String, default: null },
    email: { type: String, default: null },

    claimedNumber: { type: Number, default: null },

    utmSource: { type: String, default: null },
    utmMedium: { type: String, default: null },
    utmCampaign: { type: String, default: null },

    aprovadoEm: { type: Date, default: null },
    lembretesEnviados: { type: [Number], default: [] },
    nomePagador: { type: String, default: null },
    bancoPagador: { type: String, default: null },
    metodoPagamento: { type: String, default: null },
    dataPagamento: { type: Date, default: null },
    contatoConferidoEm: { type: Date, default: null },
    teste: { type: Boolean },
});

// teste no índice: um número escolhido num Pix de teste não bloqueia o
// mesmo número para um comprador real. Registro real NUNCA grava o campo
// (nem false): sem ele, todos entram no índice como null e continuam únicos
// entre si — um false criaria uma segunda chave e permitiria repetir número.
// Trocar o índice antigo ({ claimedNumber: 1 }) em produção: npm run migrate:indices
RifaSchema.index(
    { claimedNumber: 1, teste: 1 },
    { unique: true, partialFilterExpression: { claimedNumber: { $type: "number" } } }
);

const Rifa: Model<IRifa> = model("Rifa", RifaSchema);
export default Rifa;
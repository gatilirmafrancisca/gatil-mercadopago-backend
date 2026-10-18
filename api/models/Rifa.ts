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
    // Pix de teste de R$ 0,01: não ocupa vaga nem número real.
    teste: boolean;
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
    teste: { type: Boolean, default: false },
});

// teste no índice: um número escolhido num Pix de teste não bloqueia o
// mesmo número para um comprador real. Registros antigos, sem o campo,
// entram no índice como null — continuam únicos entre si.
// Trocar o índice antigo ({ claimedNumber: 1 }) em produção: npm run migrate:indices
RifaSchema.index(
    { claimedNumber: 1, teste: 1 },
    { unique: true, partialFilterExpression: { claimedNumber: { $type: "number" } } }
);

const Rifa: Model<IRifa> = model("Rifa", RifaSchema);
export default Rifa;
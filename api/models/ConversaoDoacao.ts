import mongoose, { Schema, model, Model } from "mongoose";

// Uma linha por pagamento já reportado ao Meta/GA4. O Mercado Pago manda
// várias notificações para o mesmo pagamento (created, updated...), e o índice
// único garante que a conversão seja enviada uma vez só, mesmo em paralelo.
export interface IConversaoDoacao {
    paymentId: string;
    rastreioId: string;
    valor: number;
    enviadoMeta: boolean;
    enviadoGA4: boolean;
}

const ConversaoDoacaoSchema: Schema<IConversaoDoacao> = new mongoose.Schema(
    {
        paymentId: { type: String, required: true, unique: true },
        rastreioId: { type: String, required: true },
        valor: { type: Number, required: true },
        enviadoMeta: { type: Boolean, default: false },
        enviadoGA4: { type: Boolean, default: false },
    },
    { timestamps: true },
);

const ConversaoDoacao: Model<IConversaoDoacao> = model("ConversaoDoacao", ConversaoDoacaoSchema);
export default ConversaoDoacao;

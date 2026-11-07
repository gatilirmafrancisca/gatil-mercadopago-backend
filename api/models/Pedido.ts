import mongoose, { Schema, model, Model } from "mongoose";
import * as RifaTypes from "../types/rifa.types.js";

/**
 * Uma compra da Ação de Natal: a pessoa escolhe de 1 a 10 números, eles
 * ficam reservados (um documento RESERVADO por número na coleção rifas,
 * protegido pelo índice único de claimedNumber) e ela paga o total.
 *
 * O _id é um UUID aleatório (reservaId): é ele que o navegador guarda e
 * manda de volta para pagar, retomar ou liberar a reserva.
 */
export interface PagamentoPedido {
    /** Pix: id do pagamento. Cartão: null até o Mercado Pago criar o pagamento. */
    mpPaymentId: string | null;
    preferenceId: string | null;
    metodo: "pix" | "cartao";
    /** external_reference do Pix (o front manda junto ao consultar o status). */
    rastreioId: string | null;
    /** Mesmo instante para o Pix e para o link do cartão. */
    expiraEm: Date;
    qrCode?: string | null;
    qrCodeBase64?: string | null;
    initPoint?: string | null;
    criadoEm: Date;
}

export interface PagamentoExtra {
    mpPaymentId: string;
    valor: number;
    em: Date;
}

export interface IPedido {
    _id: string;
    status: RifaTypes.StatusPedido;
    /** Números reservados no começo da compra. */
    numeros: number[];
    /** Números que ficaram com a pessoa depois do pagamento. */
    numerosConfirmados: number[];
    /** Números perdidos (reserva venceu antes do pagamento): ela escolhe outros. */
    numerosAEscolher: number;
    valor: number;
    expiraEm: Date;
    tentativas: number;
    pagamento: PagamentoPedido | null;
    /** Pagamento que confirmou o pedido. */
    pagoPor: string | null;
    pagoEm: Date | null;
    pagamentosExtras: PagamentoExtra[];
    alertas: RifaTypes.AlertaPedido[];

    nome: string | null;
    email: string | null;
    phone: string | null;
    /** Aceite do Regulamento e da Política de Privacidade (LGPD). */
    consentimento: { versao: string; em: Date } | null;

    utmSource: string | null;
    utmMedium: string | null;
    teste?: boolean;
    /** Hash do IP com sal (limite de reservas por pessoa). Apagado com os dados pessoais. */
    ipHash: string | null;
    anonimizadoEm: Date | null;

    criadoEm?: Date;
    atualizadoEm?: Date;
}

const PagamentoSchema = new Schema<PagamentoPedido>({
    mpPaymentId: { type: String, default: null },
    preferenceId: { type: String, default: null },
    metodo: { type: String, enum: ["pix", "cartao"], required: true },
    rastreioId: { type: String, default: null },
    expiraEm: { type: Date, required: true },
    qrCode: { type: String, default: null },
    qrCodeBase64: { type: String, default: null },
    initPoint: { type: String, default: null },
    criadoEm: { type: Date, required: true },
}, { _id: false });

const PedidoSchema: Schema<IPedido> = new mongoose.Schema({
    _id: { type: String, required: true },
    status: { type: String, enum: RifaTypes.STATUSPEDIDO, required: true },
    numeros: { type: [Number], default: [] },
    numerosConfirmados: { type: [Number], default: [] },
    numerosAEscolher: { type: Number, default: 0 },
    valor: { type: Number, required: true },
    expiraEm: { type: Date, required: true },
    tentativas: { type: Number, default: 0 },
    pagamento: { type: PagamentoSchema, default: null },
    pagoPor: { type: String, default: null },
    pagoEm: { type: Date, default: null },
    pagamentosExtras: {
        type: [new Schema<PagamentoExtra>({ mpPaymentId: String, valor: Number, em: Date }, { _id: false })],
        default: [],
    },
    alertas: { type: [String], enum: RifaTypes.ALERTASPEDIDO, default: [] },

    nome: { type: String, default: null },
    email: { type: String, default: null },
    phone: { type: String, default: null },
    consentimento: {
        type: new Schema({ versao: String, em: Date }, { _id: false }),
        default: null,
    },

    utmSource: { type: String, default: null },
    utmMedium: { type: String, default: null },
    teste: { type: Boolean },
    ipHash: { type: String, default: null },
    anonimizadoEm: { type: Date, default: null },
}, {
    timestamps: { createdAt: "criadoEm", updatedAt: "atualizadoEm" },
});

PedidoSchema.index({ status: 1, expiraEm: 1 });
PedidoSchema.index({ ipHash: 1, status: 1, expiraEm: 1 });
PedidoSchema.index({ "pagamento.mpPaymentId": 1 });

const Pedido: Model<IPedido> = model("Pedido", PedidoSchema);
export default Pedido;

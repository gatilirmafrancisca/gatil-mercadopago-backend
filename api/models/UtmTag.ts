import mongoose, { model, type Model } from "mongoose";
import { UTM_CATEGORIAS, type UtmCategoria } from "../types/origem.types.js";

/**
 * Tag de UTM. Quem cria e edita é o painel administrativo
 * (painel-adm-backend: api/models/UtmTag.ts); aqui só se lê. Os dois
 * schemas precisam continuar iguais.
 */
export interface IUtmTag {
    categoria: UtmCategoria;
    codigo: string;
    nome: string;
    descricao: string;
    ativo: boolean;
    sistema: boolean;
}

const UtmTagSchema = new mongoose.Schema<IUtmTag>({
    categoria: { type: String, enum: UTM_CATEGORIAS, required: true },
    codigo: { type: String, required: true, trim: true, uppercase: true },
    nome: { type: String, required: true, trim: true },
    descricao: { type: String, default: "" },
    ativo: { type: Boolean, default: true },
    sistema: { type: Boolean, default: false },
}, { timestamps: true });

UtmTagSchema.index({ categoria: 1, codigo: 1 }, { unique: true });

const UtmTag: Model<IUtmTag> = model<IUtmTag>("UtmTag", UtmTagSchema, "utmtags");

export default UtmTag;

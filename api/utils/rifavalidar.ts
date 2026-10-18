import { type IRifa } from "../models/Rifa.js";
import * as RifaTypes from "../types/rifa.types.js";
import { MissingParamsError, InvalidEnumError } from "./errors.js";

const hasOwnField = (obj: Record<string, any>, key: string): boolean => Object.prototype.hasOwnProperty.call(obj, key);
const isEmptyValue = (value: unknown): boolean => value === undefined || value === null || value === "";

const validateStringField = (value: unknown, fieldLabel: string): string => {
    const normalized = String(value ?? "").trim();
    if (!normalized) {
        throw new MissingParamsError(`O campo '${fieldLabel}' não pode estar vazio.`);
    }
    return normalized;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** E-mail num formato aceito pelo registro da rifa (ver validateEmailField). */
export const ehEmailValido = (value: unknown): boolean =>
    typeof value === "string" && EMAIL_REGEX.test(value.trim());

const validateEmailField = (value: unknown, fieldLabel: string): string => {
    const normalized = validateStringField(value, fieldLabel);
    if (!EMAIL_REGEX.test(normalized)) {
        throw new MissingParamsError(`O campo '${fieldLabel}' deve ser um e-mail válido.`);
    }
    return normalized.toLowerCase();
};

const validatePhoneField = (value: unknown, fieldLabel: string): string => {
    const normalized = validateStringField(value, fieldLabel);
    const digits = normalized.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 13) {
        throw new MissingParamsError(`O campo '${fieldLabel}' deve ser um telefone válido, com DDD.`);
    }
    return normalized;
};

const validateNumberField = (value: unknown, fieldLabel: string): number => {
    if (typeof value === "boolean" || isEmptyValue(value)) {
        throw new MissingParamsError(`O campo '${fieldLabel}' deve ser um número válido.`);
    }
    const parsed = Number(value);
    if (Number.isNaN(parsed) || parsed < 0) {
        throw new MissingParamsError(`O campo '${fieldLabel}' deve ser um número válido e maior ou igual a zero.`);
    }
    return parsed;
};

const validateClaimedNumberField = (value: unknown, fieldLabel: string): number => {
    const parsed = validateNumberField(value, fieldLabel);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > RifaTypes.TOTAL_NUMEROS) {
        throw new MissingParamsError(
            `O campo '${fieldLabel}' deve ser um número inteiro entre 1 e ${RifaTypes.TOTAL_NUMEROS}.`
        );
    }
    return parsed;
};

const validateEnumField = <T extends readonly string[]>(
    value: unknown,
    fieldLabel: string,
    allowedValues: T,
): T[number] => {
    const normalized = validateStringField(value, fieldLabel);
    if (!allowedValues.includes(normalized)) {
        throw new InvalidEnumError(`${fieldLabel} inválido '${normalized}'. Valores permitidos: ${allowedValues.join(", ")}.`);
    }
    return normalized as T[number];
};

const parseNumberFormValue = (value: any): number | undefined => {
    if (typeof value === "number") return value;
    if (typeof value !== "string") return undefined;
    const normalized = value.trim();
    if (normalized === "") return undefined;
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? undefined : parsed;
};

// =====================================================================
// ETAPA 1 — CRIAÇÃO (webhook do Mercado Pago)
// Só existe o que o Mercado Pago garante: paymentId, status, amount.
// name/phone/email/claimedNumber nascem null e são preenchidos na
// etapa 2.
// =====================================================================

export const normalizarDadosCriacaoRifa = (data: Partial<IRifa> & Record<string, any>): Partial<IRifa> => {
    const rawData = data as Record<string, any>;
    const normalizedData: Partial<IRifa> & Record<string, any> = { ...data };

    if (hasOwnField(rawData, "amount")) {
        const amountConvertido = parseNumberFormValue(rawData.amount);
        normalizedData.amount = amountConvertido !== undefined || isEmptyValue(rawData.amount)
            ? amountConvertido
            : rawData.amount;
    }

    if (hasOwnField(rawData, "email") && !isEmptyValue(rawData.email)) {
        normalizedData.email = String(rawData.email).trim().toLowerCase();
    }

    return normalizedData;
};

export const validarCriacaoRifa = async (data: Partial<IRifa>): Promise<void> => {
    const camposAusentes: string[] = [];

    if (!String(data.paymentId || "").trim()) camposAusentes.push("Payment ID");
    if (!String(data.status || "").trim()) camposAusentes.push("Status");
    if (isEmptyValue(data.amount)) camposAusentes.push("Amount");

    if (camposAusentes.length > 0) {
        throw new MissingParamsError(
            `Os seguintes campos obrigatórios estão ausentes ou vazios: ${camposAusentes.join(", ")}.`
        );
    }

    validateStringField(data.paymentId, "Payment ID");
    validateEnumField(data.status, "Status", RifaTypes.STATUSRIFATYPE);
    validateNumberField(data.amount, "Amount");

    // email às vezes já vem do Mercado Pago — se vier, valida o formato;
    // se não vier, tudo bem, será preenchido na confirmação.
    if (!isEmptyValue(data.email)) validateEmailField(data.email, "E-mail");
};

// =====================================================================
// ETAPA 2 — CONFIRMAÇÃO DO NÚMERO (frontend, depois do pagamento validado)
// Aqui sim name/phone/email/claimedNumber são obrigatórios — é o
// momento em que o registro fica "completo".
// =====================================================================

export const normalizarDadosConfirmacaoRifa = (data: Record<string, any>): Record<string, any> => {
    const normalizedData: Record<string, any> = { ...data };

    if (hasOwnField(data, "claimedNumber")) {
        const claimedNumberConvertido = parseNumberFormValue(data.claimedNumber);
        normalizedData.claimedNumber = claimedNumberConvertido ?? data.claimedNumber;
    }

    if (hasOwnField(data, "email") && !isEmptyValue(data.email)) {
        normalizedData.email = String(data.email).trim().toLowerCase();
    }

    if (hasOwnField(data, "name") && !isEmptyValue(data.name)) {
        normalizedData.name = String(data.name).trim();
    }

    return normalizedData;
};

export const validarConfirmacaoRifa = async (data: Record<string, any>): Promise<void> => {
    const camposAusentes: string[] = [];

    if (!String(data.name || "").trim()) camposAusentes.push("Nome");
    if (!String(data.phone || "").trim()) camposAusentes.push("Telefone");
    if (!String(data.email || "").trim()) camposAusentes.push("E-mail");
    if (isEmptyValue(data.claimedNumber)) camposAusentes.push("Número escolhido");

    if (camposAusentes.length > 0) {
        throw new MissingParamsError(
            `Os seguintes campos obrigatórios estão ausentes ou vazios: ${camposAusentes.join(", ")}.`
        );
    }

    validateStringField(data.name, "Nome");
    validatePhoneField(data.phone, "Telefone");
    validateEmailField(data.email, "E-mail");
    validateClaimedNumberField(data.claimedNumber, "Número escolhido");
};

// =====================================================================
// Utilitário de leitura (rota de listagem/consulta, se existir)
// =====================================================================

export const montarFiltrosRifa = (query: any): Record<string, any> => {
    const filters: Record<string, any> = {};
    if (!query) return filters;

    if (query.status && RifaTypes.STATUSRIFATYPE.includes(query.status as RifaTypes.StatusRifaType)) {
        filters.status = query.status;
    }
    if (hasOwnField(query, "claimedNumber")) {
        filters.claimedNumber = query.claimedNumber === "null" ? null : Number(query.claimedNumber);
    }
    if (query.email) {
        filters.email = String(query.email).trim().toLowerCase();
    }
    if (query.paymentId) {
        filters.paymentId = String(query.paymentId).trim();
    }

    return filters;
};
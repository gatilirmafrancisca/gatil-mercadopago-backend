export class MissingParamsError extends Error {

    constructor(message: string) {
        super(message);
        this.name = "MissingParamsError";
    }
}

export class UnauthorizedError extends Error {

    constructor(message: string) {
        super(message);
        this.name = "UnauthorizedError";
    }
}

export class ForbiddenError extends Error {

    constructor(message: string) {
        super(message);
        this.name = "ForbiddenError";
    }
}

export class InvalidIdError extends Error {

    constructor(message: string) {
        super(message);
        this.name = "InvalidIdError";
    }
}

export class InvalidEnumError extends Error {
    
    constructor(message: string) {
        super(message);
        this.name = "InvalidEnumError";
    }
}

export class ConflictError extends Error {

    /** Dados extras para o corpo da resposta (ex: { indisponiveis: [...] }). */
    dados: Record<string, unknown> | undefined;

    constructor(message: string, dados?: Record<string, unknown>) {
        super(message);
        this.name = "ConflictError";
        this.dados = dados;
    }
}

export class NotFoundError extends Error {

    constructor(message: string) {
        super(message);
        this.name = "NotFoundError";
    }
}
/** O recurso existia mas não vale mais (ex: reserva vencida). */
export class GoneError extends Error {

    constructor(message: string) {
        super(message);
        this.name = "GoneError";
    }
}

/** Limite de uso atingido (ex: reservas abertas demais ao mesmo tempo). */
export class TooManyRequestsError extends Error {

    constructor(message: string) {
        super(message);
        this.name = "TooManyRequestsError";
    }
}

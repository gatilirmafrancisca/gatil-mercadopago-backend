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

    constructor(message: string) {
        super(message);
        this.name = "ConflictError";
    }
}

export class NotFoundError extends Error {

    constructor(message: string) {
        super(message);
        this.name = "NotFoundError";
    }
}
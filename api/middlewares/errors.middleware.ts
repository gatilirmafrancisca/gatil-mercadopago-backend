import { type Request, type Response, type NextFunction } from "express";

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {

    if (err.name === "MissingParamsError") {
        return res.status(400).json({ message: err.message });
    }
    
    if (err.name === "InvalidEnumError") {
        return res.status(400).json({ message: err.message });
    }

    if (err.name === "InvalidIdError") {
        return res.status(400).json({ message: err.message });
    }

    if (err.name === "UnauthorizedError") {
        return res.status(401).json({ message: err.message });
    }

    if (err.name === "ForbiddenError") {
        return res.status(403).json({ message: err.message });
    }

    if (err.name === "NotFoundError") {
        return res.status(404).json({ message: err.message });
    }

    if (err.name === "ConflictError") {
        return res.status(409).json({ message: err.message });
    }

    if (err.name === "GoneError") {
        return res.status(410).json({ message: err.message });
    }

    // Erros do express.json (corpo grande demais, JSON malformado): são do
    // cliente, não do servidor.
    if (err.type === "entity.too.large") {
        return res.status(413).json({ message: "Requisição grande demais." });
    }
    if (err.type === "entity.parse.failed") {
        return res.status(400).json({ message: "JSON inválido." });
    }

    console.error("Error:", err);
    res.status(500).json({ message: "Internal Server Error." });



}
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const { verify, sign } = jwt;

export interface AuthenticatedRequest extends Request {
  paymentId?: string;
}

/**
 * Para que serve o token de posse de um pagamento:
 * - "escolher": escolher o número (emitido pelo verificar-pagamento);
 * - "reenviar": só reenviar o e-mail de um número já escolhido.
 * Tokens antigos, sem escopo, valem como "escolher".
 */
export type EscopoToken = "escolher" | "reenviar";

export function assinarTokenPagamento(paymentId: string, escopo: EscopoToken, expiresIn: "15m" | "30m") {
  return sign({ paymentId, escopo }, process.env.JWT_SECRET!, { expiresIn, algorithm: "HS256" });
}

function exigirToken(escoposAceitos: EscopoToken[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const header = req.header("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: "Token ausente." });

    try {
      const payload = verify(token, process.env.JWT_SECRET!, { algorithms: ["HS256"] }) as {
        paymentId?: unknown;
        escopo?: EscopoToken;
      };
      const escopo = payload.escopo ?? "escolher";
      if (typeof payload.paymentId !== "string" || !payload.paymentId || !escoposAceitos.includes(escopo)) {
        return res.status(401).json({ message: "Token inválido ou expirado." });
      }
      req.paymentId = payload.paymentId;
      next();
    } catch {
      res.status(401).json({ message: "Token inválido ou expirado." });
    }
  };
}

/** Escolher o número: só o token de escolha. */
export const requirePaymentToken = exigirToken(["escolher"]);

/** Reenviar o e-mail: o token de escolha ou o de reenvio do mesmo pagamento. */
export const requireResendToken = exigirToken(["escolher", "reenviar"]);

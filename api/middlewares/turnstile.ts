import type { NextFunction, Request, Response } from "express";

/**
 * Cloudflare Turnstile (captcha invisível) na reserva de números: sem ele,
 * um robô reservaria os 500 números em sequência e travaria as vendas.
 *
 * TURNSTILE_SECRET: chave secreta do site no painel da Cloudflare.
 * Sem a chave, em produção (VERCEL_ENV=production ou TURNSTILE_OBRIGATORIO=true)
 * a reserva fica fechada; fora disso (dev local, testes) a verificação é pulada.
 */
const URL_VERIFICACAO = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Objeto mutável de propósito: os testes trocam a chamada real por uma fake.
export const turnstileClient = {
    async verificar(token: string, ip: string | undefined, segredo: string): Promise<{ success: boolean; action?: string }> {
        const corpo = new URLSearchParams({ secret: segredo, response: token });
        if (ip) corpo.set("remoteip", ip);
        const resposta = await fetch(URL_VERIFICACAO, { method: "POST", body: corpo });
        if (!resposta.ok) return { success: false };
        return (await resposta.json()) as { success: boolean; action?: string };
    },
};

const obrigatorio = () =>
    process.env.VERCEL_ENV === "production" || process.env.TURNSTILE_OBRIGATORIO === "true";

export async function exigirTurnstile(req: Request, res: Response, next: NextFunction) {
    const segredo = process.env.TURNSTILE_SECRET;

    if (!segredo) {
        if (obrigatorio()) {
            console.error("[turnstile] TURNSTILE_SECRET não configurada em produção: reserva fechada");
            return res.status(503).json({ message: "A reserva está indisponível agora. Tenta de novo em instantes." });
        }
        return next();
    }

    const token = req.body?.turnstileToken ?? req.header("cf-turnstile-response");
    if (typeof token !== "string" || !token || token.length > 2048) {
        return res.status(403).json({ message: "Confirme que você não é um robô e tente de novo." });
    }

    try {
        const { success } = await turnstileClient.verificar(token, req.ip, segredo);
        if (!success) {
            return res.status(403).json({ message: "Confirme que você não é um robô e tente de novo." });
        }
        next();
    } catch (err) {
        // Cloudflare fora do ar: fecha (a alternativa seria abrir para robôs).
        console.error("[turnstile] falha ao verificar", err);
        res.status(503).json({ message: "Não conseguimos confirmar agora. Tenta de novo em instantes." });
    }
}

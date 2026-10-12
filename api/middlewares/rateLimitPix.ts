import { rateLimit } from "express-rate-limit";

// Cada rota (doação, rifa) cria as suas instâncias: o contador é por rota.

/** Cada Pix gerado é um pagamento criado no Mercado Pago. */
export const criarLimiteCriarPix = () => rateLimit({
    windowMs: 15 * 60_000,
    max: 10,
    message: { message: "Muitos Pix gerados seguidos. Aguarde alguns minutos e tente de novo." },
});

/** O front consulta a cada 4s enquanto o Pix está na tela (~15 por minuto). */
export const criarLimiteStatusPix = () => rateLimit({
    windowMs: 60_000,
    max: 60,
    message: { message: "Muitas consultas seguidas. Aguarde um minuto." },
});

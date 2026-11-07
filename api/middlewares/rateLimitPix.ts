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

/** Reenvio do e-mail de confirmação: cada um é um e-mail mandado de verdade. */
export const criarLimiteReenvio = () => rateLimit({
    windowMs: 15 * 60_000,
    max: 5,
    message: { message: "Muitos reenvios seguidos. Aguarde alguns minutos e tente de novo." },
});

/** Reservar números: cada reserva tira números do quadro por alguns minutos. */
export const criarLimiteReserva = () => rateLimit({
    windowMs: 15 * 60_000,
    max: 10,
    message: { message: "Muitas reservas seguidas. Aguarde alguns minutos e tente de novo." },
});

/** Consultar a reserva ou a compra (retomar a página, volta do cartão). */
export const criarLimiteConsultaReserva = () => rateLimit({
    windowMs: 60_000,
    max: 60,
    message: { message: "Muitas consultas seguidas. Aguarde um minuto." },
});

/** Liberar a reserva (trocar números). */
export const criarLimiteLiberar = () => rateLimit({
    windowMs: 15 * 60_000,
    max: 20,
    message: { message: "Muitas trocas seguidas. Aguarde alguns minutos e tente de novo." },
});

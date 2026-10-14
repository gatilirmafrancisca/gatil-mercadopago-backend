export const TOTAL_NUMEROS = 500;
export const TICKET_PRICE_BRL = 100;

/** Título do bilhete no Checkout Pro e descrição do Pix da rifa. */
export const DESCRICAO_RIFA = "Número da Rifa Solidária — Gatil Irmã Francisca";

export const STATUSRIFATYPE = ['PENDENTE', 'APROVADO', 'CANCELADO'] as const;
export type StatusRifaType = typeof STATUSRIFATYPE[number];
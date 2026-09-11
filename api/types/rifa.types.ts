export const TOTAL_NUMEROS = 500;
export const TICKET_PRICE_BRL = 100;

export const STATUSRIFATYPE = ['PENDENTE', 'APROVADO', 'CANCELADO'] as const;
export type StatusRifaType = typeof STATUSRIFATYPE[number];
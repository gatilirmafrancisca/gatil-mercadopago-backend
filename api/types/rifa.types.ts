export const TOTAL_NUMEROS = 500;
export const TICKET_PRICE_BRL = 100;

/** Pix de teste em produção (ver PIX_TESTE_CHAVE): mesmo fluxo, R$ 0,01. */
export const VALOR_PIX_TESTE_BRL = 0.01;

/** Título do bilhete no Checkout Pro e descrição do Pix da rifa. */
export const DESCRICAO_RIFA = "Número da Rifa Solidária — Gatil Irmã Francisca";

export const STATUSRIFATYPE = ['PENDENTE', 'APROVADO', 'CANCELADO'] as const;
export type StatusRifaType = typeof STATUSRIFATYPE[number];
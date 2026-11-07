export const TOTAL_NUMEROS = 500;
export const TICKET_PRICE_BRL = 100;

/** Pix de teste em produção (ver PIX_TESTE_CHAVE): mesmo fluxo, R$ 0,01. */
export const VALOR_PIX_TESTE_BRL = 0.01;

/** Título do bilhete no Checkout Pro e descrição do Pix da rifa. */
export const DESCRICAO_RIFA = "Número da Rifa Solidária — Gatil Irmã Francisca";

/** Dia da revelação do número ganhador (e-mails). */
export const DATA_SORTEIO_LABEL = "25/12";

/**
 * Status de cada número (coleção rifas):
 * - RESERVADO: guardado por uma reserva (pedido) que ainda não foi paga —
 *   vale até reservaExpiraEm, depois volta a ficar livre;
 * - PENDENTE / APROVADO / CANCELADO: o pagamento (fluxo antigo e pedidos pagos).
 */
export const STATUSRIFATYPE = ['PENDENTE', 'APROVADO', 'CANCELADO', 'RESERVADO'] as const;
export type StatusRifaType = typeof STATUSRIFATYPE[number];

// ---------- Reserva (escolhe os números antes de pagar) ----------

/** Máximo de números numa mesma compra. */
export const MAX_NUMEROS_POR_PEDIDO = 10;

/** Tempo para escolher como pagar, depois de reservar os números. */
export const RESERVA_ESCOLHA_MIN = 15;

/**
 * Validade do pagamento gerado (Pix e link do cartão expiram no mesmo
 * instante). O Mercado Pago não aceita Pix com menos de 30 minutos.
 */
export const PAGAMENTO_EXPIRACAO_MIN = 30;

/** Folga da reserva depois do pagamento vencer (relógio e atraso do webhook). */
export const RESERVA_FOLGA_MIN = 2;

/** Pagamentos que uma mesma reserva pode gerar (ex: Pix venceu, gera outro). */
export const MAX_TENTATIVAS_PAGAMENTO = 3;

/** Reservas ainda abertas ao mesmo tempo, por pessoa (IP). */
export const MAX_RESERVAS_ATIVAS_POR_IP = 2;

/** Dados pessoais de pedidos que não foram pagos são apagados depois disso (LGPD). */
export const RETENCAO_PEDIDO_NAO_PAGO_DIAS = 7;

/** Versão dos termos aceitos no checkout (Regulamento + Política de Privacidade). */
export const VERSAO_TERMOS = "acao-natal-2026-v1";

export const STATUSPEDIDO = [
    'RESERVADO',            // números guardados, pessoa escolhendo como pagar
    'AGUARDANDO_PAGAMENTO', // Pix ou link do cartão gerado
    'PAGO',                 // todos os números confirmados
    'PAGO_PARCIAL',         // pago, mas algum número se perdeu (escolhe de novo)
    'EXPIRADO',             // venceu sem pagamento
    'CANCELADO',            // a pessoa trocou os números ou desistiu
] as const;
export type StatusPedido = typeof STATUSPEDIDO[number];

export const ALERTASPEDIDO = [
    'VALOR_DIVERGENTE',     // o valor pago não bate com o do pedido
    'PAGAMENTO_DUPLICADO',  // mais de um pagamento aprovado (estornar o extra)
    'PAGO_APOS_EXPIRAR',    // aprovado depois da reserva vencer
] as const;
export type AlertaPedido = typeof ALERTASPEDIDO[number];

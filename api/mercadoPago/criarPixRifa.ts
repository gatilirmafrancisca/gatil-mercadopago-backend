import { randomUUID } from "node:crypto";
import { MercadoPagoConfig, Payment } from "mercadopago";
import type { UtmMetadata } from "../types/origem.types.js";
import { DESCRICAO_RIFA, TICKET_PRICE_BRL, VALOR_PIX_TESTE_BRL } from "../types/rifa.types.js";
import { formatarDataMP, PIX_EXPIRACAO_MINUTOS } from "./criarPixDoacao.js";

function getClient() {
  return new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! });
}

interface DadosPixRifa {
  email: string;
  origem: UtmMetadata;
  /** Pix de teste de R$ 0,01 (chave PIX_TESTE_CHAVE): mesmo fluxo da rifa. */
  teste?: boolean;
}

// Objeto mutável de propósito — os testes trocam a chamada real por uma
// fake (ver tests/support/mercadoPagoFake.ts).
export const mercadoPagoPixRifaClient = {
  async criar({ email, origem, teste = false }: DadosPixRifa) {
    // O rastreio vai no external_reference: é ele que o front manda junto
    // ao consultar o status, pra não dar pra consultar Pix de outra pessoa.
    const rastreioId = randomUUID();
    const expiraEm = new Date(Date.now() + PIX_EXPIRACAO_MINUTOS * 60_000);

    return new Payment(getClient()).create({
      body: {
        // Valor do bilhete definido aqui, nunca pelo navegador.
        transaction_amount: teste ? VALOR_PIX_TESTE_BRL : TICKET_PRICE_BRL,
        description: DESCRICAO_RIFA,
        payment_method_id: "pix",
        payer: { email },
        external_reference: rastreioId,
        date_of_expiration: formatarDataMP(expiraEm),
        // Mesmo metadata da preferência da rifa (criarPreferenciaRifa.ts): o
        // webhook registra a rifa e o painel separa da doação por ele.
        metadata: {
          tipo: "RIFA",
          rastreio_id: rastreioId,
          utm_source: origem.utmSource ?? null,
          utm_medium: origem.utmMedium ?? null,
          utm_campaign: "RIFA_SOLIDARIA",
          // O MP nem sempre devolve o payer.email: é daqui que sai o e-mail
          // dos lembretes de escolha do número (emailDoPagamento).
          email_contato: email,
          ...(teste ? { teste: true } : {}),
        },
      },
      // O Mercado Pago exige X-Idempotency-Key ao criar pagamentos.
      requestOptions: { idempotencyKey: rastreioId },
    });
  },
};

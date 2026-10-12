import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { registrarPagamentoFakeNaAPI } from "../support/mercadoPagoFake.js";
import { getEnviosPainel } from "../support/painelFake.js";

type Pagamento = Parameters<typeof registrarPagamentoFakeNaAPI>[0];
const pagamentos = new Map<string, Pagamento>();

function registrar(paymentId: string, status: string, bruto: number, liquido: number | undefined, metadata: string) {
    const pagamento: Pagamento = {
        id: paymentId,
        status,
        transaction_amount: bruto,
        ...(liquido !== undefined ? { transaction_details: { net_received_amount: liquido } } : {}),
        date_created: new Date().toISOString(),
        ...(status === "approved" ? { date_approved: new Date().toISOString() } : {}),
        payer: { email: "pessoa@email.com" },
        metadata: JSON.parse(metadata),
    };
    pagamentos.set(paymentId, pagamento);
    registrarPagamentoFakeNaAPI(pagamento);
}

Given(
    "que existe na API do Mercado Pago o pagamento {string} {string} de {float}, líquido {float}, com metadata {}",
    function (paymentId: string, status: string, bruto: number, liquido: number, metadata: string) {
        registrar(paymentId, status, bruto, liquido, metadata);
    }
);

Given(
    "que existe na API do Mercado Pago o pagamento {string} {string} de {float}, sem líquido, com metadata {}",
    function (paymentId: string, status: string, bruto: number, metadata: string) {
        registrar(paymentId, status, bruto, undefined, metadata);
    }
);

Given("o pagamento {string} foi aprovado em {string}", function (paymentId: string, data: string) {
    registrarPagamentoFakeNaAPI({ ...pagamentos.get(paymentId)!, date_approved: data });
});

function ultimoEnvio(paymentId: string) {
    const envios = getEnviosPainel().filter((e) => e.mercadoPagoId === paymentId);
    assert.ok(envios.length > 0, `o painel não recebeu o pagamento ${paymentId}: ${JSON.stringify(getEnviosPainel())}`);
    return envios.at(-1)!;
}

Then(
    "o painel deve ter recebido o pagamento {string} com valor {float}, status {string} e utmCampaign {string}",
    function (paymentId: string, valor: number, status: string, utmCampaign: string) {
        const envio = ultimoEnvio(paymentId);
        assert.equal(envio.valor, valor);
        assert.equal(envio.status, status);
        assert.equal(envio.utmCampaign, utmCampaign);
    }
);

Then(
    "o painel deve ter recebido o pagamento {string} com status {string} e utmCampaign {string}",
    function (paymentId: string, status: string, utmCampaign: string) {
        const envio = ultimoEnvio(paymentId);
        assert.equal(envio.status, status);
        assert.equal(envio.utmCampaign, utmCampaign);
    }
);

Then(
    "o envio do pagamento {string} ao painel deve ser uma {string} por {string} com utmSource {string} e utmMedium {string}",
    function (paymentId: string, tipo: string, metodo: string, utmSource: string, utmMedium: string) {
        const envio = ultimoEnvio(paymentId);
        assert.equal(envio.tipo, tipo);
        assert.equal(envio.metodoPagamento, metodo);
        assert.equal(envio.utmSource, utmSource);
        assert.equal(envio.utmMedium, utmMedium);
    }
);

Then("o painel deve ter recebido o pagamento {string} com a data {string}", function (paymentId: string, data: string) {
    assert.equal(ultimoEnvio(paymentId).dataConfirmacao, data);
});

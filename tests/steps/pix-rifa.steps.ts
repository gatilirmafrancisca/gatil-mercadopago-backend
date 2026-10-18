import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import request from "supertest";
import { Payment } from "mercadopago";
import { app } from "../../api/app.js";
import { criarPixRifaReal, getPedidosPixRifa, registrarPagamentoFakeNaAPI } from "../support/mercadoPagoFake.js";

// Mesmo rastreio dos Pix de doação (pix-doacao.steps.ts): os cenários que
// cruzam doação x rifa usam o "rastreio dele" dos dois lados.
const RASTREIO_TESTE = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

function pixRifaFake(paymentId: string, extra: Partial<Parameters<typeof registrarPagamentoFakeNaAPI>[0]>) {
    registrarPagamentoFakeNaAPI({
        id: paymentId,
        transaction_amount: 100,
        status: "pending",
        external_reference: RASTREIO_TESTE,
        description: "Número da Rifa Solidária — Gatil Irmã Francisca",
        date_of_expiration: new Date(Date.now() + 20 * 60_000).toISOString(),
        payer: { email: "ana@email.com" },
        metadata: { tipo: "RIFA", rastreio_id: RASTREIO_TESTE, utm_campaign: "RIFA_SOLIDARIA" },
        ...extra,
    });
}

// ---------- criar o Pix ----------

When(
    "eu peço um Pix da rifa para {string} com origem {string}",
    async function (this: any, email: string, origem: string) {
        this.lastResponse = await request(app)
            .post("/api/rifa/criar-pix")
            .set("X-Forwarded-For", this.ipCenario)
            .send({ email, utmSource: origem, utmMedium: "organico" });
    }
);

Then(
    "o Mercado Pago deve ter recebido o pedido de Pix da rifa para {string} com origem {string}",
    function (email: string, origem: string) {
        const pedidos = getPedidosPixRifa();
        assert.equal(pedidos.length, 1);
        assert.equal(pedidos[0]!.email, email);
        assert.equal(pedidos[0]!.origem.utmSource, origem);
    }
);

Then("o Mercado Pago deve ter recebido o pedido de Pix da rifa sem valor vindo do navegador", function () {
    const pedidos = getPedidosPixRifa();
    assert.equal(pedidos.length, 1);
    assert.equal("valor" in pedidos[0]!, false);
});

Then("nenhum Pix da rifa deve ter sido pedido ao Mercado Pago", function () {
    assert.equal(getPedidosPixRifa().length, 0);
});

// ---------- corpo enviado ao Mercado Pago (SDK interceptado) ----------

async function montarPixRifa(world: any, email: string, utmCampaign: string | null, teste = false) {
    const original = Payment.prototype.create;
    Payment.prototype.create = async function (args: any) {
        return args;
    } as any;

    try {
        world.argsMP = await criarPixRifaReal({
            email,
            origem: { utmSource: "INSTAGRAM", utmMedium: null, utmCampaign },
            teste,
        });
    } finally {
        Payment.prototype.create = original;
    }
}

When(
    "o pagamento Pix da rifa para {string} é montado para o Mercado Pago",
    async function (this: any, email: string) {
        await montarPixRifa(this, email, null);
    }
);

When(
    "o pagamento Pix da rifa para {string} com a campanha {string} é montado para o Mercado Pago",
    async function (this: any, email: string, campanha: string) {
        await montarPixRifa(this, email, campanha);
    }
);

Then("o transaction_amount deve ser {int}", function (this: any, valor: number) {
    assert.equal(this.argsMP.body.transaction_amount, valor);
});

Then("o metadata deve ter utm_campaign {string}", function (this: any, campanha: string) {
    assert.equal(this.argsMP.body.metadata.utm_campaign, campanha);
});

// ---------- status do Pix ----------

Given(
    "que existe um Pix da rifa {string} com status {string} e detalhe {string} na API do Mercado Pago",
    function (paymentId: string, status: string, detalhe: string) {
        pixRifaFake(paymentId, {
            status,
            status_detail: detalhe,
            ...(status === "approved"
                ? { date_approved: new Date().toISOString(), transaction_details: { net_received_amount: 99.01 } }
                : {}),
        });
    }
);

Given(
    "que existe um Pix da rifa {string} aprovado com o e-mail do pagador {string} na API do Mercado Pago",
    function (paymentId: string, email: string) {
        pixRifaFake(paymentId, {
            status: "approved",
            status_detail: "accredited",
            date_approved: new Date().toISOString(),
            payer: { email },
        });
    }
);

Given(
    "que existe um Pix da rifa {string} pendente e já vencido na API do Mercado Pago",
    function (paymentId: string) {
        pixRifaFake(paymentId, {
            status_detail: "pending_waiting_transfer",
            date_of_expiration: new Date(Date.now() - 60_000).toISOString(),
        });
    }
);

When("eu consulto o status do Pix da rifa {string} com o rastreio dele", async function (this: any, paymentId: string) {
    this.lastResponse = await request(app).get(`/api/rifa/status-pix/${paymentId}?ref=${RASTREIO_TESTE}`);
});

When(
    "eu consulto o status do Pix da rifa {string} com o rastreio {string}",
    async function (this: any, paymentId: string, ref: string) {
        this.lastResponse = await request(app).get(`/api/rifa/status-pix/${paymentId}?ref=${ref}`);
    }
);

// ---------- Pix de teste (R$ 0,01) ----------

Given("que a chave do Pix de teste é {string}", function (chave: string) {
    process.env.PIX_TESTE_CHAVE = chave;
});

When(
    "eu peço um Pix da rifa de teste para {string} com a chave {string}",
    async function (this: any, email: string, chave: string) {
        this.lastResponse = await request(app)
            .post("/api/rifa/criar-pix")
            .set("X-Forwarded-For", this.ipCenario)
            .set("x-pix-teste", chave)
            .send({ email, utmSource: "instagram", utmMedium: "organico" });
    }
);

When("o pagamento Pix da rifa de teste para {string} é montado para o Mercado Pago", async function (this: any, email: string) {
    await montarPixRifa(this, email, null, true);
});

Then("o Pix montado deve ser de teste, de R$ 0,01", function (this: any) {
    assert.equal(this.argsMP.body.transaction_amount, 0.01);
    assert.equal(this.argsMP.body.metadata.teste, true);
    assert.equal(this.argsMP.body.metadata.tipo, "RIFA");
    assert.equal(this.argsMP.body.description, "Número da Rifa Solidária — Gatil Irmã Francisca");
});

Then("o Pix montado não deve ser de teste", function (this: any) {
    assert.equal(this.argsMP.body.transaction_amount, 100);
    assert.equal("teste" in this.argsMP.body.metadata, false);
});

Then("o Mercado Pago deve ter recebido o pedido de Pix da rifa de teste", function () {
    const pedidos = getPedidosPixRifa();
    assert.equal(pedidos.length, 1);
    assert.equal(pedidos[0]!.teste, true);
});

Then("o Mercado Pago deve ter recebido o pedido de Pix da rifa normal", function () {
    const pedidos = getPedidosPixRifa();
    assert.equal(pedidos.length, 1);
    assert.equal(pedidos[0]!.teste ?? false, false);
});

Then("o Pix criado deve ter o valor {string}", function (this: any, valor: string) {
    assert.equal(String(this.lastResponse.body.data.valor), valor);
});

Given("que existe um Pix da rifa de teste {string} aprovado na API do Mercado Pago", function (paymentId: string) {
    pixRifaFake(paymentId, {
        status: "approved",
        status_detail: "accredited",
        transaction_amount: 0.01,
        date_approved: new Date().toISOString(),
        transaction_details: { net_received_amount: 0.01 },
        metadata: { tipo: "RIFA", rastreio_id: RASTREIO_TESTE, utm_campaign: "RIFA_SOLIDARIA", teste: true },
    });
});

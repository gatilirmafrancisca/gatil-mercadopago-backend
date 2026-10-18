import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import request from "supertest";
import { Payment } from "mercadopago";
import { app } from "../../api/app.js";
import { normalizarRastreio } from "../../api/types/rastreio.types.js";
import { criarPixReal, getPedidosPix, PIX_FAKE, registrarPagamentoFakeNaAPI } from "../support/mercadoPagoFake.js";

const RASTREIO_TESTE = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

// ---------- criar o Pix ----------

When(
    "eu peço um Pix de {float} para {string} com origem {string}",
    async function (this: any, valor: number, email: string, origem: string) {
        this.lastResponse = await request(app)
            .post("/api/doacao/criar-pix")
            .set("X-Forwarded-For", this.ipCenario)
            .send({ valor, email, utmSource: origem, utmMedium: "organico" });
    }
);

When("eu envio {string} com o corpo {}", async function (this: any, comando: string, corpo: string) {
    const [, caminho] = comando.split(" ") as [string, string];
    this.lastResponse = await request(app).post(caminho).set("X-Forwarded-For", this.ipCenario).send(JSON.parse(corpo));
});

Then(
    "a resposta deve trazer o Pix com paymentId, rastreioId, qrCode, qrCodeBase64 e expiraEm",
    function (this: any) {
        // O Pix da rifa também devolve valor e teste (pix-rifa.steps.ts).
        const { paymentId, rastreioId, qrCode, qrCodeBase64, expiraEm } = this.lastResponse.body.data;
        assert.deepEqual({ paymentId, rastreioId, qrCode, qrCodeBase64, expiraEm }, {
            paymentId: PIX_FAKE.id,
            rastreioId: PIX_FAKE.rastreioId,
            qrCode: PIX_FAKE.qrCode,
            qrCodeBase64: PIX_FAKE.qrCodeBase64,
            expiraEm: PIX_FAKE.expiraEm,
        });
    }
);

Then(
    "o Mercado Pago deve ter recebido o pedido de Pix de {float} para {string} com origem {string}",
    function (valor: number, email: string, origem: string) {
        const pedidos = getPedidosPix();
        assert.equal(pedidos.length, 1);
        assert.equal(pedidos[0]!.valor, valor);
        assert.equal(pedidos[0]!.email, email);
        assert.equal(pedidos[0]!.origem.utmSource, origem);
    }
);

Then("nenhum Pix deve ter sido pedido ao Mercado Pago", function () {
    assert.equal(getPedidosPix().length, 0);
});

// ---------- corpo enviado ao Mercado Pago (SDK interceptado) ----------

When(
    "o pagamento Pix de {float} para {string} é montado para o Mercado Pago",
    async function (this: any, valor: number, email: string) {
        const original = Payment.prototype.create;
        Payment.prototype.create = async function (args: any) {
            (this as any).__args = args;
            return args;
        } as any;

        try {
            this.argsMP = await criarPixReal({
                valor,
                email,
                origem: { utmSource: "INSTAGRAM", utmMedium: null, utmCampaign: null },
                rastreio: normalizarRastreio(undefined, undefined, undefined),
            });
        } finally {
            Payment.prototype.create = original;
        }
    }
);

Then(
    "o corpo enviado deve ter payment_method_id {string} e o e-mail {string}",
    function (this: any, metodo: string, email: string) {
        assert.equal(this.argsMP.body.payment_method_id, metodo);
        assert.equal(this.argsMP.body.payer.email, email);
    }
);

Then("o external_reference deve ser igual ao rastreio_id do metadata", function (this: any) {
    const { body } = this.argsMP;
    assert.ok(body.external_reference);
    assert.equal(body.external_reference, body.metadata.rastreio_id);
});

Then("o valor_esperado do metadata deve ser igual ao transaction_amount", function (this: any) {
    const { body } = this.argsMP;
    assert.equal(body.metadata.valor_esperado, body.transaction_amount);
});

Then("o metadata deve ter tipo {string}", function (this: any, tipo: string) {
    assert.equal(this.argsMP.body.metadata.tipo, tipo);
});

Then("a expiração deve estar no fuso de Brasília", function (this: any) {
    const expiracao: string = this.argsMP.body.date_of_expiration;
    assert.match(expiracao, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}-03:00$/);
    // ~30 minutos à frente
    const minutos = (Date.parse(expiracao) - Date.now()) / 60_000;
    assert.ok(minutos > 29 && minutos <= 30, `expiração a ${minutos} minutos`);
});

Then("o pedido deve usar o rastreio como chave de idempotência", function (this: any) {
    assert.equal(this.argsMP.requestOptions.idempotencyKey, this.argsMP.body.external_reference);
});

// ---------- status do Pix ----------

Given(
    "que existe um Pix de doação {string} com status {string} e detalhe {string} na API do Mercado Pago",
    function (paymentId: string, status: string, detalhe: string) {
        registrarPagamentoFakeNaAPI({
            id: paymentId,
            status,
            status_detail: detalhe,
            transaction_amount: 50,
            external_reference: RASTREIO_TESTE,
            date_of_expiration: new Date(Date.now() + 20 * 60_000).toISOString(),
            payer: { email: "ana@email.com" },
            metadata: { tipo: "DOACAO", rastreio_id: RASTREIO_TESTE, valor_esperado: 50 },
        });
    }
);

Given(
    "que existe um Pix de doação {string} pendente e já vencido na API do Mercado Pago",
    function (paymentId: string) {
        registrarPagamentoFakeNaAPI({
            id: paymentId,
            status: "pending",
            status_detail: "pending_waiting_transfer",
            transaction_amount: 50,
            external_reference: RASTREIO_TESTE,
            date_of_expiration: new Date(Date.now() - 60_000).toISOString(),
            metadata: { tipo: "DOACAO", rastreio_id: RASTREIO_TESTE, valor_esperado: 50 },
        });
    }
);

When("eu consulto o status do Pix {string} com o rastreio dele", async function (this: any, paymentId: string) {
    this.lastResponse = await request(app).get(`/api/doacao/status/${paymentId}?ref=${RASTREIO_TESTE}`);
});

When(
    "eu consulto o status do Pix {string} com o rastreio {string}",
    async function (this: any, paymentId: string, ref: string) {
        this.lastResponse = await request(app).get(`/api/doacao/status/${paymentId}?ref=${ref}`);
    }
);

Then("o status do Pix deve ser {string}", function (this: any, status: string) {
    assert.equal(this.lastResponse.body.data?.status, status, JSON.stringify(this.lastResponse.body));
});

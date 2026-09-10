import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import request from "supertest";
import { createHmac } from "node:crypto";
import { app } from "../../api/app.js";
import Rifa from "../../api/models/Rifa.js";

// ⚠️ Caminho assumido como "/mercadopago/webhook", com base em
// app.use("/mercadopago", mercadoPagoRoute). Se a rota real do
// webhook no seu router for outra (ex: "/mercadopago/webhooks"),
// ajuste só esta constante.
const CAMINHO_WEBHOOK = "/mercadopago/webhook";

function assinarWebhook(dataId: string) {
    const ts = Date.now().toString();
    const requestId = "req-teste";
    const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
    const v1 = createHmac("sha256", process.env.MP_WEBHOOK_SECRET!).update(manifest).digest("hex");
    return { xSignature: `ts=${ts},v1=${v1}`, xRequestId: requestId };
}

// O webhook responde 200 antes de terminar de processar (ack
// imediato, processamento em segundo plano) — por isso as
// verificações no banco precisam de um pequeno retry, não uma
// checagem única logo após a resposta HTTP.
async function aguardarDocumento(filtro: Record<string, unknown>, tentativas = 20) {
    for (let i = 0; i < tentativas; i++) {
        const doc = await Rifa.findOne(filtro);
        if (doc) return doc;
        await new Promise((r) => setTimeout(r, 50));
    }
    return null;
}

Given("que existe um pagamento aprovado {string} já registrado no banco", async function (paymentId: string) {
    await Rifa.create({ paymentId, status: "APROVADO", amount: 100, claimedNumber: null });
});

When(
    "o backend recebe uma notificação de webhook para {string} com assinatura válida",
    async function (this: any, paymentId: string) {
        const { xSignature, xRequestId } = assinarWebhook(paymentId);
        this.lastResponse = await request(app)
            .post(CAMINHO_WEBHOOK)
            .set("x-signature", xSignature)
            .set("x-request-id", xRequestId)
            .send({ type: "payment", data: { id: paymentId } });
    }
);

When(
    "o backend recebe uma segunda notificação de webhook para {string} com assinatura válida",
    async function (this: any, paymentId: string) {
        const { xSignature, xRequestId } = assinarWebhook(paymentId);
        this.lastResponse = await request(app)
            .post(CAMINHO_WEBHOOK)
            .set("x-signature", xSignature)
            .set("x-request-id", xRequestId)
            .send({ type: "payment", data: { id: paymentId } });
    }
);

When("o backend recebe uma notificação de webhook com assinatura inválida", async function (this: any) {
    this.lastResponse = await request(app)
        .post(CAMINHO_WEBHOOK)
        .set("x-signature", "ts=1,v1=assinatura-forjada")
        .set("x-request-id", "req-teste")
        .send({ type: "payment", data: { id: "000000" } });
});

Then(
    "deve existir um documento na coleção {string} com paymentId {string}",
    async function (this: any, _colecao: string, paymentId: string) {
        const doc = await aguardarDocumento({ paymentId });
        assert.ok(doc, `esperava um documento com paymentId ${paymentId}`);
        this.ultimoDocumento = doc;
    }
);

Then("o campo {string} desse documento deve ser null", function (this: any, campo: string) {
    assert.equal(this.ultimoDocumento[campo], null);
});

Then("nenhum documento deve ser criado na coleção {string}", async function (_colecao: string) {
    await new Promise((r) => setTimeout(r, 150));
    const total = await Rifa.countDocuments({});
    assert.equal(total, 0);
});

Then(
    "deve existir exatamente {int} documento com paymentId {string} na coleção {string}",
    async function (esperado: number, paymentId: string, _colecao: string) {
        await aguardarDocumento({ paymentId });
        await new Promise((r) => setTimeout(r, 150)); // tempo pra um 2º processamento indevido acontecer, se for o caso
        const total = await Rifa.countDocuments({ paymentId });
        assert.equal(total, esperado);
    }
);

Then(
    "deve existir um documento com paymentId {string} e status {string}",
    async function (paymentId: string, status: string) {
        const doc = await aguardarDocumento({ paymentId, status });
        assert.ok(doc, `esperava paymentId ${paymentId} com status ${status}`);
    }
);
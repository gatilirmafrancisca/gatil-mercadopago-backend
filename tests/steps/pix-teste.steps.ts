import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import Rifa from "../../api/models/Rifa.js";
import { getEnviosPainel } from "../support/painelFake.js";

Given(
    "que existe um pagamento de teste {string} aprovado com o número {int}",
    async function (paymentId: string, numero: number) {
        await Rifa.create({ paymentId, status: "APROVADO", amount: 0.01, teste: true, claimedNumber: numero });
    }
);

Then("o pagamento {string} deve estar marcado como teste, com valor {float}", async function (paymentId: string, valor: number) {
    const doc = await Rifa.findOne({ paymentId });
    assert.equal(doc?.teste, true);
    assert.equal(doc?.amount, valor);
});

Then("a grade de números não deve ter o número {int}", function (this: any, numero: number) {
    assert.equal(this.lastResponse.status, 200);
    assert.equal((this.lastResponse.body.data as number[]).includes(numero), false);
});

Then("a descrição enviada ao painel para {string} deve começar com {string}", function (paymentId: string, prefixo: string) {
    const envio = getEnviosPainel().filter((e) => e.mercadoPagoId === paymentId).at(-1);
    assert.ok(envio?.descricao?.startsWith(prefixo), `descrição: ${envio?.descricao}`);
});

Given(
    "que existe um registro antigo {string} com o número {int}, sem o campo teste",
    async function (paymentId: string, numero: number) {
        // Direto na coleção: o documento fica exatamente como os de antes do campo.
        await Rifa.collection.insertOne({ paymentId, status: "APROVADO", amount: 100, claimedNumber: numero });
    }
);

Then("o pagamento {string} não deve ter o campo teste gravado", async function (paymentId: string) {
    const doc = await Rifa.collection.findOne({ paymentId });
    assert.ok(doc, `sem documento ${paymentId}`);
    assert.equal("teste" in doc, false, JSON.stringify(doc));
});

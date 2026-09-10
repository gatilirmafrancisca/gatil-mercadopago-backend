import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import Rifa from "../../api/models/Rifa.js";
import { getChamadasCriarPreferencia } from "../support/mercadoPagoFake.js";

Given("que existem {int} números já ocupados no banco", async function (quantidade: number) {
    const docs = Array.from({ length: quantidade }, (_, i) => ({
        paymentId: `SEED-${i}`,
        status: "APROVADO",
        amount: 100,
        claimedNumber: null,
    }));
    if (docs.length > 0) await Rifa.insertMany(docs);
});

Then("nenhuma preferência deve ser criada na API do Mercado Pago", function () {
    assert.equal(getChamadasCriarPreferencia(), 0);
});
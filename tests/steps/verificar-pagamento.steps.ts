import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import Rifa from "../../api/models/Rifa.js";

Given(
    "que existe um pagamento confirmado {string} no banco, sem número escolhido",
    async function (paymentId: string) {
        await Rifa.create({ paymentId, status: "APROVADO", amount: 100, claimedNumber: null });
    }
);

Given(
    "que existe um pagamento confirmado {string} no banco, com claimedNumber {int}",
    async function (paymentId: string, numero: number) {
        await Rifa.create({ paymentId, status: "APROVADO", amount: 100, claimedNumber: numero });
    }
);

Then(
    "deve existir um documento com paymentId {string} no banco depois da chamada",
    async function (paymentId: string) {
        const doc = await Rifa.findOne({ paymentId });
        assert.ok(doc, `esperava um documento com paymentId ${paymentId}`);
    }
);
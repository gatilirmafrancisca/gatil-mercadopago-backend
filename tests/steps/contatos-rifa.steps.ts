import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import Rifa from "../../api/models/Rifa.js";
import { registrarPagamentoFakeNaAPI } from "../support/mercadoPagoFake.js";

const DIA_MS = 24 * 60 * 60_000;
const DESCRICAO = "Número da Rifa Solidária — Gatil Irmã Francisca";

Given(
    "que existe um Pix da rifa {string} aprovado sem payer.email, com email_contato {string} e pago por {string}",
    function (paymentId: string, email: string, nome: string) {
        registrarPagamentoFakeNaAPI({
            id: paymentId,
            status: "approved",
            status_detail: "accredited",
            transaction_amount: 100,
            description: DESCRICAO,
            payment_method_id: "pix",
            payment_type_id: "bank_transfer",
            date_approved: new Date().toISOString(),
            payer: { email: null },
            point_of_interaction: { transaction_data: { bank_info: { payer: { long_name: nome } } } },
            metadata: { tipo: "RIFA", utm_campaign: "RIFA_SOLIDARIA", email_contato: email },
        });
    }
);

Given(
    "que existe um pagamento com cartão {string} aprovado sem e-mail, do titular {string}",
    function (paymentId: string, titular: string) {
        registrarPagamentoFakeNaAPI({
            id: paymentId,
            status: "approved",
            status_detail: "accredited",
            transaction_amount: 100,
            description: DESCRICAO,
            payment_method_id: "visa",
            payment_type_id: "credit_card",
            date_approved: new Date().toISOString(),
            card: { cardholder: { name: titular } },
            metadata: { tipo: "RIFA", utm_campaign: "RIFA_SOLIDARIA" },
        });
    }
);

Given(
    "que existe um Pix da rifa {string} pendente, sem data de expiração, criado há {int} dias na API do Mercado Pago",
    function (paymentId: string, dias: number) {
        registrarPagamentoFakeNaAPI({
            id: paymentId,
            status: "pending",
            status_detail: "pending_waiting_transfer",
            transaction_amount: 100,
            description: DESCRICAO,
            payment_method_id: "pix",
            payment_type_id: "bank_transfer",
            date_created: new Date(Date.now() - dias * DIA_MS).toISOString(),
            metadata: { tipo: "RIFA", utm_campaign: "RIFA_SOLIDARIA" },
        });
    }
);

Given(
    "que existe um pagamento com cartão {string} em análise, criado há {int} dias na API do Mercado Pago",
    function (paymentId: string, dias: number) {
        registrarPagamentoFakeNaAPI({
            id: paymentId,
            status: "in_process",
            status_detail: "pending_review_manual",
            transaction_amount: 100,
            description: DESCRICAO,
            payment_method_id: "visa",
            payment_type_id: "credit_card",
            date_created: new Date(Date.now() - dias * DIA_MS).toISOString(),
            metadata: { tipo: "RIFA", utm_campaign: "RIFA_SOLIDARIA" },
        });
    }
);

Given(
    "que existe um pagamento {string} aprovado há {int} dias, sem número e sem e-mail",
    async function (paymentId: string, dias: number) {
        await Rifa.create({
            paymentId,
            status: "APROVADO",
            amount: 100,
            claimedNumber: null,
            aprovadoEm: new Date(Date.now() - dias * DIA_MS),
        });
    }
);

Then(
    "o pagamento {string} deve ter o e-mail {string} e o meio {string}",
    async function (paymentId: string, email: string, meio: string) {
        const doc = await Rifa.findOne({ paymentId });
        assert.equal(doc?.email, email);
        assert.equal(doc?.metodoPagamento, meio);
    }
);

Then("o pagamento {string} deve ter o nome do pagador {string}", async function (paymentId: string, nome: string) {
    const doc = await Rifa.findOne({ paymentId });
    assert.equal(doc?.nomePagador, nome);
});

Then("o pagamento {string} deve estar sem e-mail", async function (paymentId: string) {
    const doc = await Rifa.findOne({ paymentId });
    assert.ok(doc, `sem documento ${paymentId}`);
    assert.equal(doc.email, null);
});

Then("o contato do pagamento {string} deve estar marcado como conferido", async function (paymentId: string) {
    const doc = await Rifa.findOne({ paymentId });
    assert.ok(doc?.contatoConferidoEm instanceof Date);
});

import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import Rifa from "../../api/models/Rifa.js";
import { registrarPagamentoFakeNaAPI } from "../support/mercadoPagoFake.js";

const DIA_MS = 24 * 60 * 60_000;
const DESCRICAO = "Número da Rifa Solidária — Gatil Irmã Francisca";
const DATA_APROVACAO = "2026-09-21T18:35:21.000-03:00";

Given(
    "que existe um Pix da rifa {string} aprovado com o payer.email mascarado, com email_contato {string} e vindo do banco {string}",
    function (paymentId: string, email: string, banco: string) {
        registrarPagamentoFakeNaAPI({
            id: paymentId,
            status: "approved",
            status_detail: "accredited",
            transaction_amount: 100,
            description: DESCRICAO,
            payment_method_id: "pix",
            payment_type_id: "bank_transfer",
            date_approved: DATA_APROVACAO,
            // É assim que o MP devolve o Pix: e-mail mascarado e, no lugar do
            // nome da pessoa, só o banco de origem.
            payer: { email: "XXXXXXXXXXX" },
            point_of_interaction: { transaction_data: { bank_info: { payer: { long_name: banco } } } },
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

Then(
    "o pagamento {string} deve ter o banco {string}, sem nome do pagador",
    async function (paymentId: string, banco: string) {
        const doc = await Rifa.findOne({ paymentId });
        assert.equal(doc?.bancoPagador, banco);
        assert.equal(doc?.nomePagador, null);
    }
);

Then("o pagamento {string} deve ter a data real do pagamento", async function (paymentId: string) {
    const doc = await Rifa.findOne({ paymentId });
    assert.equal(doc?.dataPagamento?.toISOString(), new Date(DATA_APROVACAO).toISOString());
});

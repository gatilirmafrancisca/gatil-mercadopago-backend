import { Given } from "@cucumber/cucumber";
import { registrarPagamentoFakeNaAPI } from "../support/mercadoPagoFake.js";

Given("que existe um pagamento aprovado {string} na API do Mercado Pago", function (paymentId: string) {
    registrarPagamentoFakeNaAPI({
        id: paymentId,
        status: "approved",
        transaction_amount: 100,
        payer: { email: "doador@exemplo.com" },
        metadata: { utm_campaign: "RIFA_SOLIDARIA" },
    });
});

Given(
    "que existe um pagamento com status {string} {string} na API do Mercado Pago",
    function (status: string, paymentId: string) {
        registrarPagamentoFakeNaAPI({
            id: paymentId,
            status,
            transaction_amount: 100,
            metadata: { utm_campaign: "RIFA_SOLIDARIA" },
        });
    }
);

Given(
    "que existe um pagamento aprovado {string} só na API do Mercado Pago, ainda não no banco",
    function (paymentId: string) {
        registrarPagamentoFakeNaAPI({
            id: paymentId,
            status: "approved",
            transaction_amount: 100,
            payer: { email: "doador@exemplo.com" },
            metadata: { utm_campaign: "RIFA_SOLIDARIA" },
        });
    }
);
Given("que existe uma doação aprovada {string} na API do Mercado Pago", function (paymentId: string) {
    registrarPagamentoFakeNaAPI({
        id: paymentId,
        status: "approved",
        transaction_amount: 5,
        description: "Doação — Gatil Irmã Francisca",
        metadata: { tipo: "DOACAO", utm_campaign: "CAMPANHA_ESPECIFICA" },
    });
});

Given(
    "que existe um Pix aprovado {string} da preferência antiga da rifa com a campanha {string}",
    function (paymentId: string, campanha: string) {
        // Preferência de antes do tipo "RIFA": só a descrição a identifica.
        registrarPagamentoFakeNaAPI({
            id: paymentId,
            status: "approved",
            transaction_amount: 100,
            description: "Número da Rifa Solidária — Gatil Irmã Francisca",
            metadata: { utm_campaign: campanha },
        });
    }
);

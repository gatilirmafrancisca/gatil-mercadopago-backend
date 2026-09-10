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
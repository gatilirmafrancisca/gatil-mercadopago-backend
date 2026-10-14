import { When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { Preference } from "mercadopago";
import { criarPreferenciaRealDoacao, criarPreferenciaRealRifa } from "../support/mercadoPagoFake.js";

async function montarPreferencia(world: any, campanha: string, utmCampaign: string | null = null) {
    const original = Preference.prototype.create;
    Preference.prototype.create = async function (args: any) {
        return args;
    } as any;

    try {
        world.argsMP = campanha === "rifa"
            ? await criarPreferenciaRealRifa({ utmSource: "INSTAGRAM", utmMedium: null, utmCampaign })
            : await criarPreferenciaRealDoacao(50, { utmSource: "INSTAGRAM", utmMedium: null, utmCampaign });
    } finally {
        Preference.prototype.create = original;
    }
}

When("a preferência da {word} é montada para o Mercado Pago", async function (this: any, campanha: string) {
    await montarPreferencia(this, campanha);
});

When(
    "a preferência da rifa com a campanha {string} é montada para o Mercado Pago",
    async function (this: any, utmCampaign: string) {
        await montarPreferencia(this, "rifa", utmCampaign);
    }
);

Then(
    "a preferência deve excluir os tipos de pagamento {string} e {string}",
    function (this: any, a: string, b: string) {
        const ids = this.argsMP.body.payment_methods.excluded_payment_types.map((t: { id: string }) => t.id);
        assert.ok(ids.includes(a), `faltou excluir ${a}: ${ids}`);
        assert.ok(ids.includes(b), `faltou excluir ${b}: ${ids}`);
    }
);

Then("a preferência deve excluir o meio de pagamento {string}", function (this: any, meio: string) {
    const ids = this.argsMP.body.payment_methods.excluded_payment_methods.map((t: { id: string }) => t.id);
    assert.ok(ids.includes(meio), `faltou excluir ${meio}: ${ids}`);
});

Then("a preferência deve aceitar até {int} parcelas", function (this: any, parcelas: number) {
    assert.equal(this.argsMP.body.payment_methods.installments, parcelas);
});

Then(
    "o metadata da preferência deve ter tipo {string} e utm_campaign {string}",
    function (this: any, tipo: string, campanha: string) {
        assert.equal(this.argsMP.body.metadata.tipo, tipo);
        assert.equal(this.argsMP.body.metadata.utm_campaign, campanha);
    }
);

Then("a preferência deve ter external_reference igual ao rastreio_id do metadata", function (this: any) {
    const { external_reference, metadata } = this.argsMP.body;
    assert.ok(external_reference, "faltou o external_reference");
    assert.equal(external_reference, metadata.rastreio_id);
});

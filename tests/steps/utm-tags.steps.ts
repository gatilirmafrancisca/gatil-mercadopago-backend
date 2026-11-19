import { Given, When, Then, After } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../../api/app.js";
import UtmTag from "../../api/models/UtmTag.js";
import { UTM_TAGS_PADRAO, CAMPANHA_RIFA, type UtmCategoria } from "../../api/types/origem.types.js";
import { mercadoPagoDoacaoClient } from "../../api/mercadoPago/criarPreferenciaDoacao.js";
import type { UtmMetadata } from "../../api/types/origem.types.js";

// Simula o que o painel grava na coleção `utmtags` (é ele quem escreve).

Given("que o painel cadastrou as tags de UTM padrão", async function () {
    for (const [categoria, codigos] of Object.entries(UTM_TAGS_PADRAO)) {
        for (const codigo of codigos) {
            await UtmTag.create({ categoria, codigo, nome: codigo, sistema: codigo === CAMPANHA_RIFA });
        }
    }
});

Given("que o painel cadastrou a tag {string} {string}", async function (categoria: UtmCategoria, codigo: string) {
    await UtmTag.create({ categoria, codigo, nome: codigo });
});

Given("que o painel desativou a tag {string} {string}", async function (categoria: UtmCategoria, codigo: string) {
    await UtmTag.updateOne({ categoria, codigo }, { ativo: false });
});

const findOriginal = UtmTag.find;
Given("que a leitura das tags de UTM falha", function () {
    (UtmTag as any).find = () => { throw new Error("banco fora do ar"); };
});

const criarPreferenciaOriginal = mercadoPagoDoacaoClient.criar;
let origemPreferencia: UtmMetadata | null = null;

When("eu crio a preferência de doação de {int} com o corpo {}", async function (this: any, valor: number, corpo: string) {
    mercadoPagoDoacaoClient.criar = async (_valor, origem) => {
        origemPreferencia = origem;
        return { init_point: "https://mercadopago.com.br/checkout/fake-doacao" } as any;
    };
    this.lastResponse = await request(app)
        .post("/api/doacao/criar-pagamento")
        .set("X-Forwarded-For", this.ipCenario)
        .send({ valor, ...JSON.parse(corpo) });
});

After(function () {
    (UtmTag as any).find = findOriginal;
    mercadoPagoDoacaoClient.criar = criarPreferenciaOriginal;
    origemPreferencia = null;
});

Then("as tags de {string} devem ser {string}", function (this: any, chave: string, esperadas: string) {
    assert.deepEqual([...this.lastResponse.body.data[chave]].sort(), esperadas.split(",").sort());
});

Then("a mensagem deve conter {string}", function (this: any, trecho: string) {
    assert.ok(
        String(this.lastResponse.body.message).includes(trecho),
        `mensagem: ${this.lastResponse.body.message}`,
    );
});

Then("a preferência de doação deve ter ido ao Mercado Pago com utmCampaign {string}", function (campanha: string) {
    assert.equal(origemPreferencia?.utmCampaign, campanha);
});

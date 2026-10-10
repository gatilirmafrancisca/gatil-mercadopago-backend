import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { backUrlsRifa } from "../../api/mercadoPago/criarPreferenciaRifa.js";
import { backUrlsDoacao } from "../../api/mercadoPago/criarPreferenciaDoacao.js";

Given("que o FRONTEND_URL é {string}", function (this: any, frontendUrl: string) {
    this.frontendUrl = frontendUrl;
});

When("eu monto as URLs de retorno da rifa", function (this: any) {
    this.backUrls = backUrlsRifa(this.frontendUrl);
});

When("eu monto as URLs de retorno da doação", function (this: any) {
    this.backUrls = backUrlsDoacao(this.frontendUrl);
});

Then("a URL de {string} deve ser {string}", function (this: any, tipo: "success" | "pending" | "failure", esperada: string) {
    assert.equal(this.backUrls[tipo], esperada);
});

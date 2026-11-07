import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../../api/app.js";
import Rifa from "../../api/models/Rifa.js";
import { assinarTokenPagamento } from "../../api/middlewares/token.middleware.js";
import { getEmailsEnviados } from "../support/emailFake.js";

const participante = { name: "Participante Teste", phone: "71999990000", email: "teste@exemplo.com" };

Given(
    "que o pagamento {string} escolheu o número {int} com o e-mail {string}",
    async function (paymentId: string, numero: number, email: string) {
        await Rifa.create({ paymentId, status: "APROVADO", amount: 100, claimedNumber: numero, name: "Dono", email });
    }
);

Given("que tenho o token de reenvio do pagamento {string}", function (this: any, paymentId: string) {
    this.token = assinarTokenPagamento(paymentId, "reenviar", "15m");
});

When(
    "eu peço o reenvio do e-mail do pagamento {string} com esse token",
    async function (this: any, paymentId: string) {
        this.lastResponse = await request(app)
            .post("/api/rifa/reenviar-email")
            .set("X-Forwarded-For", this.ipCenario)
            .set("Authorization", `Bearer ${this.token}`)
            .send({ paymentId });
    }
);

When("eu peço o reenvio do e-mail com esse token", async function (this: any) {
    this.lastResponse = await request(app)
        .post("/api/rifa/reenviar-email")
        .set("X-Forwarded-For", this.ipCenario)
        .set("Authorization", `Bearer ${this.token}`)
        .send({});
});

When("eu peço o reenvio do e-mail do pagamento {string} sem token", async function (this: any, paymentId: string) {
    this.lastResponse = await request(app)
        .post("/api/rifa/reenviar-email")
        .set("X-Forwarded-For", this.ipCenario)
        .send({ paymentId });
});

When("eu tento confirmar o número {int} com esse token", async function (this: any, numero: number) {
    this.lastResponse = await request(app)
        .post("/api/rifa/confirmar-numero")
        .set("Authorization", `Bearer ${this.token}`)
        .send({ ...participante, claimedNumber: numero });
});

When(
    "eu tento confirmar o número {int} com um token sem assinatura do pagamento {string}",
    async function (this: any, numero: number, paymentId: string) {
        const semAssinatura = jwt.sign({ paymentId }, "", { algorithm: "none" });
        this.lastResponse = await request(app)
            .post("/api/rifa/confirmar-numero")
            .set("Authorization", `Bearer ${semAssinatura}`)
            .send({ ...participante, claimedNumber: numero });
    }
);

When("eu envio um corpo JSON de {int} kB para {string}", async function (this: any, kb: number, comando: string) {
    const [, caminho] = comando.split(" ") as [string, string];
    this.lastResponse = await request(app)
        .post(caminho)
        .set("X-Forwarded-For", this.ipCenario)
        .set("Content-Type", "application/json")
        .send(JSON.stringify({ email: "a".repeat(kb * 1024) }));
});

When("eu envio um JSON malformado para {string}", async function (this: any, comando: string) {
    const [, caminho] = comando.split(" ") as [string, string];
    this.lastResponse = await request(app)
        .post(caminho)
        .set("X-Forwarded-For", this.ipCenario)
        .set("Content-Type", "application/json")
        .send("{\"email\": ");
});

Then("o header {string} deve ser {string}", function (this: any, header: string, valor: string) {
    assert.equal(this.lastResponse.headers[header], valor);
});

Then("o header {string} não deve existir", function (this: any, header: string) {
    assert.equal(this.lastResponse.headers[header], undefined);
});

Then("deve ter sido enviado {int} e-mail para {string}", function (quantidade: number, email: string) {
    assert.equal(getEmailsEnviados().filter((e) => e.to === email).length, quantidade);
});

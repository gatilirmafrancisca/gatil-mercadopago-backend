import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import request from "supertest";
import jwt, { type SignOptions } from "jsonwebtoken";

const { sign } = jwt;
import { app } from "../../api/app.js";
import Rifa from "../../api/models/Rifa.js";

function criarToken(paymentId: string, expiresIn: SignOptions["expiresIn"] = "30m") {
    return sign({ paymentId }, process.env.JWT_SECRET!, { expiresIn });
}

const payloadPadrao = {
    name: "Participante Teste",
    phone: "71999990000",
    email: "teste@exemplo.com",
};

// Toda vez que um passo recebe "POST /algum/caminho" como string única,
// essa função separa e garante pro TypeScript que o caminho existe —
// mesma correção que já usamos no token da corrida de números.
function extrairCaminho(comando: string): string {
    const [, caminho] = comando.split(" ") as [string, string];
    return caminho;
}

// ---------- cenários individuais ----------

Given("que tenho um token válido para o pagamento {string}", async function (this: any, paymentId: string) {
    await Rifa.create({ paymentId, status: "APROVADO", amount: 100, claimedNumber: null });
    this.token = criarToken(paymentId);
    this.paymentId = paymentId;
});

Given("que tenho um token expirado para o pagamento {string}", async function (this: any, paymentId: string) {
    await Rifa.create({ paymentId, status: "APROVADO", amount: 100, claimedNumber: null });
    this.token = criarToken(paymentId, "-10s");
});

Given("esse pagamento já confirmou o número {int}", async function (this: any, numero: number) {
    await Rifa.updateOne(
        { paymentId: this.paymentId },
        { claimedNumber: numero, name: "Já Confirmado", phone: "71988887777", email: "ja@confirmado.com" }
    );
});

When(
    "eu envio {string} com o token e os dados do participante para o número {int}",
    async function (this: any, comando: string, numero: number) {
        this.lastResponse = await request(app)
            .post(extrairCaminho(comando))
            .set("Authorization", `Bearer ${this.token}`)
            .send({ ...payloadPadrao, claimedNumber: numero });
    }
);

When("eu envio {string} sem header de autorização", async function (this: any, comando: string) {
    this.lastResponse = await request(app)
        .post(extrairCaminho(comando))
        .send({ ...payloadPadrao, claimedNumber: 1 });
});

When("eu envio {string} com esse token", async function (this: any, comando: string) {
    this.lastResponse = await request(app)
        .post(extrairCaminho(comando))
        .set("Authorization", `Bearer ${this.token}`)
        .send({ ...payloadPadrao, claimedNumber: 1 });
});

When(
    "eu envio {string} de novo com o mesmo token, para o número {int}",
    async function (this: any, comando: string, numero: number) {
        this.lastResponse = await request(app)
            .post(extrairCaminho(comando))
            .set("Authorization", `Bearer ${this.token}`)
            .send({ ...payloadPadrao, claimedNumber: numero });
    }
);

When(
    "eu envio {string} sem o campo {string}",
    async function (this: any, comando: string, campoOmitido: string) {
        const payload: Record<string, unknown> = { ...payloadPadrao, claimedNumber: 1 };
        delete payload[campoOmitido];
        this.lastResponse = await request(app)
            .post(extrairCaminho(comando))
            .set("Authorization", `Bearer ${this.token}`)
            .send(payload);
    }
);

Then(
    "o documento do pagamento {string} deve ter claimedNumber igual a {int}",
    async function (paymentId: string, numero: number) {
        const doc = await Rifa.findOne({ paymentId });
        assert.equal(doc?.claimedNumber, numero);
    }
);

Then(
    "o claimedNumber do pagamento {string} deve continuar sendo {int}",
    async function (paymentId: string, numero: number) {
        const doc = await Rifa.findOne({ paymentId });
        assert.equal(doc?.claimedNumber, numero);
    }
);

// ---------- corrida de números ----------

const tokensCorrida: Record<string, string> = {};
let respostasCorrida: request.Response[] = [];

Given(
    "que tenho tokens válidos para os pagamentos {string} e {string}",
    async function (id1: string, id2: string) {
        for (const paymentId of [id1, id2]) {
            await Rifa.create({ paymentId, status: "APROVADO", amount: 100, claimedNumber: null });
            tokensCorrida[paymentId] = criarToken(paymentId);
        }
    }
);

Given("o número {int} está disponível", async function (numero: number) {
    const jaExiste = await Rifa.exists({ claimedNumber: numero });
    assert.equal(jaExiste, null);
});

When(
    "os dois pagamentos tentam confirmar o número {int} simultaneamente",
    async function (numero: number) {
        const [id1, id2] = Object.keys(tokensCorrida) as [string, string];
        const payload = { ...payloadPadrao, claimedNumber: numero };

        respostasCorrida = await Promise.all([
            request(app)
                .post("/api/rifa/confirmar-numero")
                .set("Authorization", `Bearer ${tokensCorrida[id1]}`)
                .send(payload),
            request(app)
                .post("/api/rifa/confirmar-numero")
                .set("Authorization", `Bearer ${tokensCorrida[id2]}`)
                .send(payload),
        ]);
    }
);

Then("exatamente uma das duas respostas deve ser {int}", function (status: number) {
    const quantidade = respostasCorrida.filter((r) => r.status === status).length;
    assert.equal(quantidade, 1, `esperava 1 resposta ${status}, veio ${quantidade}`);
});

Then("a outra resposta deve ser {int}", function (status: number) {
    const quantidade = respostasCorrida.filter((r) => r.status === status).length;
    assert.equal(quantidade, 1, `esperava 1 resposta ${status}, veio ${quantidade}`);
});

Then(
    "deve existir exatamente {int} documento no banco com claimedNumber igual a {int}",
    async function (esperado: number, numero: number) {
        const quantidade = await Rifa.countDocuments({ claimedNumber: numero });
        assert.equal(quantidade, esperado);
    }
);
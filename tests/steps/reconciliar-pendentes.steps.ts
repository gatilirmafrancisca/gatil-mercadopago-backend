import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import request from "supertest";
import { Types } from "mongoose";
import jwt from "jsonwebtoken";
import { app } from "../../api/app.js";
import Rifa from "../../api/models/Rifa.js";
import type { StatusRifaType } from "../../api/types/rifa.types.js";
import { getEmailsEnviados, textoDoEmail } from "../support/emailFake.js";

const CAMINHO_TAREFAS = "/api/rifa/tarefas-diarias";
const SEGREDO_CRON_TESTE = "segredo-cron-teste";
const DIA_MS = 24 * 60 * 60_000;

/** _id com data de criação no passado: o schema não tem createdAt. */
const idCriadoHa = (ms: number) => Types.ObjectId.createFromTime(Math.floor((Date.now() - ms) / 1000));

// ---------- dados ----------

Given(
    "que existe um pagamento {string} registrado no banco como {string} há {int} minutos",
    async function (paymentId: string, status: string, minutos: number) {
        await Rifa.create({
            _id: idCriadoHa(minutos * 60_000),
            paymentId,
            status: status as StatusRifaType,
            amount: 100,
            claimedNumber: null,
        });
    }
);

async function criarAprovadoSemNumero(paymentId: string, ms: number, email: string, lembretes: number[] = []) {
    await Rifa.create({
        paymentId,
        status: "APROVADO",
        amount: 100,
        email,
        claimedNumber: null,
        aprovadoEm: new Date(Date.now() - ms),
        lembretesEnviados: lembretes,
    });
}

Given(
    "que existe um pagamento {string} aprovado há {int} minutos, sem número, com o e-mail {string}",
    async function (paymentId: string, minutos: number, email: string) {
        await criarAprovadoSemNumero(paymentId, minutos * 60_000, email);
    }
);

Given(
    "que existe um pagamento {string} aprovado há {int} dias, sem número, com o e-mail {string}",
    async function (paymentId: string, dias: number, email: string) {
        await criarAprovadoSemNumero(paymentId, dias * DIA_MS, email);
    }
);

Given(
    "que existe um pagamento {string} aprovado há {int} dias, sem número, com o e-mail {string} e os lembretes {string} já enviados",
    async function (paymentId: string, dias: number, email: string, lembretes: string) {
        await criarAprovadoSemNumero(paymentId, dias * DIA_MS, email, lembretes.split(",").map(Number));
    }
);

Given("que os números de 1 a {int} já estão escolhidos", async function (ate: number) {
    await Rifa.insertMany(Array.from({ length: ate }, (_, i) => ({
        paymentId: `OCUPADO-${i + 1}`,
        status: "APROVADO",
        amount: 100,
        claimedNumber: i + 1,
    })));
});

// ---------- ações ----------

When("o agendador roda as tarefas da rifa", async function (this: any) {
    process.env.CRON_SECRET = SEGREDO_CRON_TESTE;
    this.lastResponse = await request(app)
        .get(CAMINHO_TAREFAS)
        .set("authorization", `Bearer ${SEGREDO_CRON_TESTE}`);
});

When("alguém chama as tarefas da rifa sem o segredo do agendador", async function (this: any) {
    process.env.CRON_SECRET = SEGREDO_CRON_TESTE;
    this.lastResponse = await request(app).get(CAMINHO_TAREFAS);
});

When("alguém abre a grade de números da rifa", async function (this: any) {
    this.lastResponse = await request(app).get("/api/rifa/numeros-ocupados");
});

// ---------- e-mails ----------

const emailsDeEscolha = (para: string) =>
    getEmailsEnviados().filter((e) => e.to === para && /escolher|Escolha/.test(e.subject));

Then("nenhum e-mail deve ter sido enviado", function () {
    assert.deepEqual(getEmailsEnviados().map((e) => `${e.to}: ${e.subject}`), []);
});

Then("deve ter sido enviado {int} e-mail de escolha de número para {string}", function (quantidade: number, para: string) {
    assert.equal(emailsDeEscolha(para).length, quantidade, JSON.stringify(getEmailsEnviados().map((e) => e.subject)));
});

Then(
    "o e-mail de escolha para {string} deve dizer que faltam {int} dias e ter o link do pagamento {string}",
    async function (para: string, dias: number, paymentId: string) {
        const email = emailsDeEscolha(para).at(-1);
        assert.ok(email, `nenhum e-mail de escolha para ${para}`);
        assert.match(email.subject, new RegExp(`faltam ${dias} dias`));

        const texto = await textoDoEmail(email);
        assert.match(texto, new RegExp(`Faltam ${dias} dias`));
        assert.ok(
            texto.includes(`https://rifa.teste/rifa/pagamento-aprovado?payment_id=${paymentId}`),
            `o e-mail não tem o link de escolha: ${texto}`
        );
        assert.match(texto, /um número livre será sorteado/);
    }
);

Then("o e-mail de escolha para {string} deve ser o do último dia", async function (para: string) {
    const email = emailsDeEscolha(para).at(-1);
    assert.ok(email, `nenhum e-mail de escolha para ${para}`);
    assert.match(email.subject, /Último dia/);
    assert.match(await textoDoEmail(email), /Hoje é o último dia/);
});

Then(
    "deve ter sido enviado o e-mail de confirmação com o número sorteado para {string}",
    async function (para: string) {
        const email = getEmailsEnviados().find((e) => e.to === para && /Seu número/.test(e.subject));
        assert.ok(email, `nenhum e-mail de confirmação para ${para}`);
        assert.match(await textoDoEmail(email), /sorteamos um número livre/);
    }
);

Then("o pagamento {string} deve ter um número entre 1 e 500", async function (paymentId: string) {
    const doc = await Rifa.findOne({ paymentId });
    assert.ok(doc?.claimedNumber, `o pagamento ${paymentId} não recebeu número`);
    assert.ok(doc.claimedNumber >= 1 && doc.claimedNumber <= 500);
});

Then("o pagamento {string} deve ter o número {int}", async function (paymentId: string, numero: number) {
    const doc = await Rifa.findOne({ paymentId });
    assert.equal(doc?.claimedNumber, numero);
});

Then("o pagamento {string} deve continuar sem número", async function (paymentId: string) {
    const doc = await Rifa.findOne({ paymentId });
    assert.equal(doc?.claimedNumber, null);
});

Then("o pagamento {string} deve ter os lembretes {string} registrados", async function (paymentId: string, lembretes: string) {
    const doc = await Rifa.findOne({ paymentId });
    assert.deepEqual([...(doc?.lembretesEnviados ?? [])].sort((a, b) => b - a), lembretes.split(",").map(Number));
});

Then("o pagamento {string} deve ter a data de aprovação registrada", async function (paymentId: string) {
    const doc = await Rifa.findOne({ paymentId });
    assert.ok(doc?.aprovadoEm instanceof Date, `aprovadoEm vazio em ${paymentId}`);
});

When("eu escolho o número {int} com esse token", async function (this: any, numero: number) {
    this.lastResponse = await request(app)
        .post("/api/rifa/confirmar-numero")
        .set("Authorization", `Bearer ${this.token}`)
        .send({ name: "Participante Teste", phone: "71999990000", email: "teste@exemplo.com", claimedNumber: numero });
    assert.equal(this.lastResponse.status, 200, JSON.stringify(this.lastResponse.body));
});

Given("que tenho um token para o pagamento já registrado {string}", function (this: any, paymentId: string) {
    this.token = jwt.sign({ paymentId }, process.env.JWT_SECRET!, { expiresIn: "30m" });
    this.paymentId = paymentId;
});

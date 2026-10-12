import { Before, After, BeforeAll } from "@cucumber/cucumber";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Rifa from "../../api/models/Rifa.js";
import { resetarFakesMercadoPago } from "../support/mercadoPagoFake.js";
import { PAINEL_URL_TESTE, resetarPainelFake } from "../support/painelFake.js";

BeforeAll(function () {
    // Só define se ainda não existir — em CI, o workflow já define
    // esses valores; localmente, sem .env de teste, isso evita que
    // todo mundo precise lembrar de criar um antes de rodar.
    process.env.JWT_SECRET ??= "segredo-de-teste-local";
    process.env.MP_ACCESS_TOKEN ??= "fake-token-testes";
    process.env.MP_WEBHOOK_SECRET ??= "segredo-webhook-teste";
    process.env.RESEND_API_KEY ??= "re_fake_teste";
    process.env.EMAIL_FROM ??= "Teste <teste@example.com>";
    // Sempre o fake: os testes nunca falam com o painel de verdade.
    process.env.PAINEL_ADM_URL = PAINEL_URL_TESTE;
    process.env.PAINEL_ADM_INTERNAL_SECRET ??= "segredo-painel-teste";
});

let mongod: MongoMemoryServer;

Before(async function () {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    // Mongoose cria índices em segundo plano, de forma assíncrona, logo
    // após a conexão abrir — sem esperar isso terminar, existe uma
    // janela real (mais visível em CI do que localmente) onde o índice
    // único de claimedNumber ainda não existe, e testes de corrida
    // conseguem passar dos dois lados por pura sorte de timing.
    await Rifa.init();

    resetarFakesMercadoPago();
    resetarPainelFake();
});

After(async function () {
    await mongoose.disconnect();
    await mongod.stop();
});
import { When } from "@cucumber/cucumber";
import request from "supertest";
import { app } from "../../api/app.js";

const CAMINHO_RECONCILIAR = "/api/rifa/reconciliar-pendentes";
const SEGREDO_CRON_TESTE = "segredo-cron-teste";

When("o agendador confere os pagamentos pendentes da rifa", async function (this: any) {
    process.env.CRON_SECRET = SEGREDO_CRON_TESTE;
    this.lastResponse = await request(app)
        .get(CAMINHO_RECONCILIAR)
        .set("authorization", `Bearer ${SEGREDO_CRON_TESTE}`);
});

When("alguém chama a conferência dos pendentes sem o segredo do agendador", async function (this: any) {
    process.env.CRON_SECRET = SEGREDO_CRON_TESTE;
    this.lastResponse = await request(app).get(CAMINHO_RECONCILIAR);
});

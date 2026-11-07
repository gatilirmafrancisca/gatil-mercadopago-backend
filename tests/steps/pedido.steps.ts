import { Given, When, Then, defineParameterType } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import request from "supertest";
import { createHmac, randomUUID } from "node:crypto";
import { Payment, Preference } from "mercadopago";
import { app } from "../../api/app.js";
import Rifa from "../../api/models/Rifa.js";
import Pedido from "../../api/models/Pedido.js";
import { tarefasDosPedidos } from "../../api/services/pedido.service.js";
import { formatarDataMP } from "../../api/mercadoPago/criarPixDoacao.js";
import type { DadosPagamentoPedido } from "../../api/mercadoPago/pedidoMercadoPago.js";
import {
    criarPixPedidoReal,
    criarPreferenciaPedidoReal,
    getPagamentoFake,
    getPagamentosCancelados,
    getPixDePedidos,
    getPreferenciasDePedidos,
    registrarPagamentoFakeNaAPI,
} from "../support/mercadoPagoFake.js";
import { getEmailsEnviados, textoDoEmail } from "../support/emailFake.js";
import { getEnviosPainel } from "../support/painelFake.js";

// "10", "10 e 20", "10, 20 e 30" → [10, 20, 30]
defineParameterType({
    name: "numeros",
    regexp: /\d+(?:, \d+)*(?: e \d+)?/,
    transformer: (texto: string) => texto.split(/, | e /).map(Number),
});

const MIN = 60_000;
const DIA = 24 * 60 * MIN;
const CONTATO = { nome: "Ana Teste", email: "ana@email.com", phone: "(71) 99999-8888", aceiteTermos: true };
const PHONE_DIGITOS = "71999998888";
const pad = (n: number) => String(n).padStart(3, "0");

/** Outro IP no mesmo cenário (outra pessoa). */
function outroIp(world: any, i = 1) {
    const [, , c, d] = String(world.ipCenario).split(".");
    return `10.${100 + i}.${c}.${d}`;
}

function assinarWebhook(dataId: string) {
    const ts = Date.now().toString();
    const requestId = `req-${randomUUID()}`;
    const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
    const v1 = createHmac("sha256", process.env.MP_WEBHOOK_SECRET!).update(manifest).digest("hex");
    return { xSignature: `ts=${ts},v1=${v1}`, xRequestId: requestId };
}

function enviarWebhook(paymentId: string) {
    const { xSignature, xRequestId } = assinarWebhook(paymentId);
    return request(app)
        .post("/mercadopago/webhook")
        .set("x-signature", xSignature)
        .set("x-request-id", xRequestId)
        .send({ type: "payment", data: { id: paymentId } });
}

function reservar(world: any, numeros: unknown, { ip, headers = {}, corpo = {} }: { ip?: string; headers?: Record<string, string>; corpo?: Record<string, unknown> } = {}) {
    let req = request(app).post("/api/rifa/reservar").set("X-Forwarded-For", ip ?? world.ipCenario);
    for (const [k, v] of Object.entries(headers)) req = req.set(k, v);
    return req.send({ numeros, utmSource: "instagram", utmMedium: "organico", ...corpo });
}

async function reservarEGuardar(world: any, numeros: number[], opcoes?: Parameters<typeof reservar>[2]) {
    world.lastResponse = await reservar(world, numeros, opcoes);
    if (world.lastResponse.status === 201) world.reservaId = world.lastResponse.body.data.reservaId;
    return world.lastResponse;
}

function gerarPagamento(world: any, metodo: "pix" | "cartao", contato: Record<string, unknown> = CONTATO) {
    return request(app)
        .post(metodo === "pix" ? "/api/rifa/criar-pix" : "/api/rifa/criar-pagamento")
        .set("X-Forwarded-For", world.ipCenario)
        .send({ reservaId: world.reservaId, ...contato });
}

async function gerarEGuardar(world: any, metodo: "pix" | "cartao", contato?: Record<string, unknown>) {
    world.lastResponse = await gerarPagamento(world, metodo, contato);
    if (world.lastResponse.status === 201 && metodo === "pix") world.pix = world.lastResponse.body.data;
    return world.lastResponse;
}

function aprovarPixNaApi(world: any, valor?: number) {
    const pagamento = getPagamentoFake(String(world.pix.paymentId));
    assert.ok(pagamento, "o Pix da reserva não existe na API fake");
    pagamento.status = "approved";
    pagamento.date_approved = new Date().toISOString();
    pagamento.transaction_details = { net_received_amount: pagamento.transaction_amount * 0.99 };
    if (valor !== undefined) pagamento.transaction_amount = valor;
}

const pedidoAtual = (world: any) => Pedido.findById(world.reservaId).lean();
const emailsDeConfirmacao = () => getEmailsEnviados().filter((e) => /Ação Solidária do Gatil/.test(e.subject));

function perto(iso: string | Date, minutos: number, margemSeg = 20) {
    const diff = new Date(iso).getTime() - Date.now();
    assert.ok(Math.abs(diff - minutos * MIN) < margemSeg * 1000, `esperava ~${minutos} min, veio ${(diff / MIN).toFixed(2)} min`);
}

async function vencerReserva(world: any) {
    const passado = new Date(Date.now() - 60_000);
    await Pedido.updateOne({ _id: world.reservaId }, { $set: { expiraEm: passado } });
    await Rifa.updateMany({ pedidoId: world.reservaId, status: "RESERVADO" }, { $set: { reservaExpiraEm: passado } });
}

// =========================== reservar ===========================

When("eu reservo os números {numeros}", async function (this: any, numeros: number[]) {
    await reservarEGuardar(this, numeros);
});

When("eu reservo o número {int}", async function (this: any, numero: number) {
    await reservarEGuardar(this, [numero]);
});

Given("que eu reservei os números {numeros}", async function (this: any, numeros: number[]) {
    const r = await reservarEGuardar(this, numeros);
    assert.equal(r.status, 201, JSON.stringify(r.body));
});

Given("que eu reservei os números {numeros} e gerei o Pix", async function (this: any, numeros: number[]) {
    assert.equal((await reservarEGuardar(this, numeros)).status, 201);
    const r = await gerarEGuardar(this, "pix");
    assert.equal(r.status, 201, JSON.stringify(r.body));
});

Given("que eu reservei os números {numeros} e gerei o cartão", async function (this: any, numeros: number[]) {
    assert.equal((await reservarEGuardar(this, numeros)).status, 201);
    const r = await gerarEGuardar(this, "cartao");
    assert.equal(r.status, 201, JSON.stringify(r.body));
});

When(/^eu reservo com o corpo (.+)$/, async function (this: any, corpo: string) {
    this.lastResponse = await request(app)
        .post("/api/rifa/reservar")
        .set("X-Forwarded-For", this.ipCenario)
        .set("Content-Type", "application/json")
        .send(corpo);
});

When(
    "{int} pessoas diferentes tentam reservar o número {int} ao mesmo tempo",
    async function (this: any, pessoas: number, numero: number) {
        this.respostas = await Promise.all(
            Array.from({ length: pessoas }, (_, i) => reservar(this, [numero], { ip: outroIp(this, i + 1) }))
        );
    }
);

Then("exatamente {int} das reservas deve ter sido aceita", function (this: any, quantidade: number) {
    assert.equal(this.respostas.filter((r: any) => r.status === 201).length, quantidade);
});

Then("as outras {int} devem ter recebido {int}", function (this: any, quantidade: number, status: number) {
    assert.equal(this.respostas.filter((r: any) => r.status === status).length, quantidade);
});

When(
    "ao mesmo tempo eu reservo o número {int}, o pagamento antigo confirma o {int} e o painel cadastra o {int}",
    async function (this: any, a: number, b: number, c: number) {
        await Promise.allSettled([
            reservar(this, [a]),
            request(app).post("/api/rifa/confirmar-numero").set("Authorization", `Bearer ${this.token}`)
                .send({ name: "Fluxo Antigo", phone: "71999990000", email: "antigo@teste.com", claimedNumber: b }),
            // O painel grava direto na mesma coleção (painel-adm-backend).
            Rifa.create({ paymentId: `MANUAL-${pad(c)}`, status: "APROVADO", amount: 100, claimedNumber: c, name: "Manual" }),
        ]);
    }
);

Given("que o número {int} já foi vendido", async function (numero: number) {
    await Rifa.create({ paymentId: `VENDIDO-${numero}`, status: "APROVADO", amount: 100, claimedNumber: numero });
});

Given("que {int} números já foram vendidos", async function (quantidade: number) {
    await Rifa.insertMany(Array.from({ length: quantidade }, (_, i) => ({
        paymentId: `VENDIDO-${i + 1}`, status: "APROVADO", amount: 100, claimedNumber: i + 1,
    })));
});

Then("a reserva deve ter os números {numeros} e nenhum indisponível", function (this: any, numeros: number[]) {
    assert.deepEqual(this.lastResponse.body.data.numeros, numeros);
    assert.deepEqual(this.lastResponse.body.data.indisponiveis, []);
});

Then(
    "a reserva deve ter os números {numeros} e o indisponível {int}",
    function (this: any, numeros: number[], indisponivel: number) {
        assert.deepEqual(this.lastResponse.body.data.numeros, numeros);
        assert.deepEqual(this.lastResponse.body.data.indisponiveis, [indisponivel]);
    }
);

Then("a resposta deve listar {int} como indisponível", function (this: any, numero: number) {
    assert.ok(this.lastResponse.body.indisponiveis?.includes(numero), JSON.stringify(this.lastResponse.body));
});

Then("a reserva deve expirar em cerca de {int} minutos", function (this: any, minutos: number) {
    perto(this.lastResponse.body.data.expiraEm, minutos);
});

Then("o pedido deve estar {string} com valor {int}", async function (this: any, status: string, valor: number) {
    const pedido = await pedidoAtual(this);
    assert.ok(pedido, "pedido não encontrado");
    assert.equal(pedido.status, status);
    assert.equal(pedido.valor, valor);
});

Then("devem existir {int} números com status {string} no banco", async function (quantidade: number, status: string) {
    assert.equal(await Rifa.countDocuments({ status }), quantidade);
});

Then("nenhum pedido deve ter sido criado", async function () {
    assert.equal(await Pedido.countDocuments(), 0);
});

Given("que a verificação anti-robô está ligada", function () {
    process.env.TURNSTILE_SECRET = "segredo-turnstile-teste";
});

Given("que o anti-robô é obrigatório mas não tem chave configurada", function () {
    process.env.TURNSTILE_OBRIGATORIO = "true";
});

When("eu reservo os números {numeros} sem o token anti-robô", async function (this: any, numeros: number[]) {
    await reservarEGuardar(this, numeros);
});

When(
    "eu reservo os números {numeros} com o token anti-robô {string}",
    async function (this: any, numeros: number[], token: string) {
        await reservarEGuardar(this, numeros, { corpo: { turnstileToken: token } });
    }
);

When("eu faço {int} tentativas inválidas de reserva", async function (this: any, tentativas: number) {
    for (let i = 0; i < tentativas; i++) {
        const r = await reservar(this, []);
        assert.equal(r.status, 400);
    }
});

Then("o número {int} deve continuar livre", async function (numero: number) {
    assert.equal(await Rifa.countDocuments({ claimedNumber: numero }), 0);
});

Given("que alguém reservou o número {int} e a reserva venceu", async function (this: any, numero: number) {
    const r = await reservar(this, [numero], { ip: outroIp(this, 9) });
    assert.equal(r.status, 201);
    const passado = new Date(Date.now() - 60_000);
    await Rifa.updateMany({ pedidoId: r.body.data.reservaId }, { $set: { reservaExpiraEm: passado } });
    await Pedido.updateOne({ _id: r.body.data.reservaId }, { $set: { expiraEm: passado } });
});

When("outra pessoa reserva o número {int}", async function (this: any, numero: number) {
    this.lastResponse = await reservar(this, [numero], { ip: outroIp(this, 2) });
});

Then("o número {int} não deve aparecer como ocupado", function (this: any, numero: number) {
    assert.equal(this.lastResponse.body.data.includes(numero), false);
});

Then("o número {int} deve aparecer como ocupado", function (this: any, numero: number) {
    assert.equal(this.lastResponse.body.data.includes(numero), true);
});

When("eu libero a reserva", async function (this: any) {
    this.lastResponse = await request(app)
        .post("/api/rifa/liberar-reserva")
        .set("X-Forwarded-For", this.ipCenario)
        .send({ reservaId: this.reservaId });
});

Then("o Pix da reserva deve ter sido cancelado no Mercado Pago", function (this: any) {
    assert.ok(getPagamentosCancelados().includes(String(this.pix.paymentId)));
});

Then("os números {numeros} devem estar {string} no banco", async function (numeros: number[], status: string) {
    for (const numero of numeros) {
        const doc = await Rifa.findOne({ claimedNumber: numero }).lean();
        assert.equal(doc?.status, status, `número ${numero}`);
    }
});

Then("o número {int} deve estar {string} no banco", async function (numero: number, status: string) {
    const doc = await Rifa.findOne({ claimedNumber: numero, pedidoId: { $ne: null } }).lean();
    assert.equal(doc?.status, status);
});

When("eu consulto a reserva", async function (this: any) {
    this.lastResponse = await request(app).get(`/api/rifa/reserva/${this.reservaId}`).set("X-Forwarded-For", this.ipCenario);
});

Then(
    "a consulta deve mostrar o status {string} e os números {numeros}",
    function (this: any, status: string, numeros: number[]) {
        assert.equal(this.lastResponse.body.data.status, status);
        assert.deepEqual(this.lastResponse.body.data.numeros, numeros);
    }
);

Then("a consulta não deve conter e-mail, nome nem telefone", function (this: any) {
    const corpo = JSON.stringify(this.lastResponse.body);
    assert.equal(corpo.includes(CONTATO.email), false);
    assert.equal(corpo.includes(CONTATO.nome), false);
    assert.equal(corpo.includes(PHONE_DIGITOS), false);
    assert.equal(corpo.includes("ipHash"), false);
});

When(
    "eu reservo o número {int} no modo teste com a chave {string}",
    async function (this: any, numero: number, chave: string) {
        await reservarEGuardar(this, [numero], { headers: { "x-pix-teste": chave } });
    }
);

Given(
    "que eu reservei o número {int} no modo teste com a chave {string}",
    async function (this: any, numero: number, chave: string) {
        const r = await reservarEGuardar(this, [numero], { headers: { "x-pix-teste": chave } });
        assert.equal(r.status, 201, JSON.stringify(r.body));
    }
);

// =========================== pagar ===========================

When("eu gero o Pix da reserva com os meus dados", async function (this: any) {
    await gerarEGuardar(this, "pix");
});

When("eu gero o pagamento com cartão da reserva com os meus dados", async function (this: any) {
    await gerarEGuardar(this, "cartao");
});

When("eu gero o Pix da reserva duas vezes ao mesmo tempo", async function (this: any) {
    this.respostas = await Promise.all([gerarPagamento(this, "pix"), gerarPagamento(this, "pix")]);
});

Then("deve haver exatamente {int} Pix ativo no Mercado Pago para a reserva", function (this: any, quantidade: number) {
    const cancelados = new Set(getPagamentosCancelados());
    const ativos = getPixDePedidos().filter((p) => p.pedidoId === this.reservaId && !cancelados.has(p.paymentId));
    assert.equal(ativos.length, quantidade);
});

When(
    "eu gero o Pix da reserva com {string} igual a {string}",
    async function (this: any, campo: string, valor: string) {
        let convertido: unknown = valor;
        if (valor === "false") convertido = false;
        else if (valor.startsWith("{")) convertido = JSON.parse(valor);
        await gerarEGuardar(this, "pix", { ...CONTATO, [campo]: convertido });
    }
);

Then("nenhum Pix de pedido deve ter sido criado", function () {
    assert.equal(getPixDePedidos().length, 0);
});

Given("a reserva venceu", async function (this: any) {
    await vencerReserva(this);
});

Then(
    "o Mercado Pago deve ter recebido um Pix de {int} reais para os números {numeros}",
    function (this: any, valor: number, numeros: number[]) {
        const pix = getPixDePedidos();
        assert.equal(pix.length, 1);
        assert.equal(pix[0]!.valor, valor);
        assert.deepEqual(pix[0]!.numeros, numeros);
        assert.equal(pix[0]!.email, CONTATO.email);
    }
);

Then("o Mercado Pago deve ter recebido um Pix de teste", function () {
    assert.equal(getPixDePedidos()[0]?.teste, true);
});

Then("o Pix deve expirar em cerca de {int} minutos", function (this: any, minutos: number) {
    perto(this.lastResponse.body.data.expiraEm, minutos);
    perto(getPixDePedidos()[0]!.expiraEm, minutos);
});

Then("o link do cartão deve expirar em cerca de {int} minutos", function (this: any, minutos: number) {
    perto(this.lastResponse.body.data.expiraEm, minutos);
    perto(getPreferenciasDePedidos()[0]!.expiraEm, minutos);
});

Then("a reserva deve valer até {int} minutos depois do Pix expirar", async function (this: any, minutos: number) {
    const fimPix = new Date(this.pix.expiraEm).getTime();
    const pedido = await pedidoAtual(this);
    assert.equal(pedido!.expiraEm.getTime() - fimPix, minutos * MIN);
    const docs = await Rifa.find({ pedidoId: this.reservaId }).lean();
    for (const d of docs) assert.equal(d.reservaExpiraEm!.getTime() - fimPix, minutos * MIN);
});

Then("o pedido deve guardar o nome, o e-mail, o WhatsApp e o aceite dos termos", async function (this: any) {
    const pedido = await pedidoAtual(this);
    assert.equal(pedido!.nome, CONTATO.nome);
    assert.equal(pedido!.email, CONTATO.email);
    assert.equal(pedido!.phone, PHONE_DIGITOS);
    assert.ok(pedido!.consentimento?.versao);
    assert.ok(pedido!.consentimento?.em);
});

// ---------- corpo enviado ao Mercado Pago (SDK interceptado) ----------

function dadosPedido(quantidade: number): DadosPagamentoPedido {
    const numeros = Array.from({ length: quantidade }, (_, i) => i + 1);
    return {
        pedidoId: randomUUID(),
        numeros,
        valor: quantidade * 100,
        expiraEm: new Date(Date.now() + 30 * MIN),
        email: CONTATO.email,
        nome: CONTATO.nome,
        origem: { utmSource: "INSTAGRAM", utmMedium: "ORGANICO" },
    };
}

When(
    "a preferência do cartão de um pedido de {int} números é montada para o Mercado Pago",
    async function (this: any, quantidade: number) {
        const original = Preference.prototype.create;
        Preference.prototype.create = async function (args: any) { return args; } as any;
        this.dadosPedido = dadosPedido(quantidade);
        try {
            this.argsMP = await criarPreferenciaPedidoReal(this.dadosPedido);
        } finally {
            Preference.prototype.create = original;
        }
    }
);

When("o Pix de um pedido de {int} números é montado para o Mercado Pago", async function (this: any, quantidade: number) {
    const original = Payment.prototype.create;
    Payment.prototype.create = async function (args: any) { return args; } as any;
    this.dadosPedido = dadosPedido(quantidade);
    try {
        this.argsMP = await criarPixPedidoReal(this.dadosPedido);
    } finally {
        Payment.prototype.create = original;
    }
});

Then(
    "a preferência deve ter {int} item com quantidade {int} de {int} reais",
    function (this: any, itens: number, quantidade: number, valor: number) {
        const corpo = this.argsMP.body;
        assert.equal(corpo.items.length, itens);
        assert.equal(corpo.items[0].quantity, quantidade);
        assert.equal(corpo.items[0].unit_price, valor);
    }
);

Then("a preferência deve expirar no mesmo instante que um Pix gerado agora", async function (this: any) {
    const corpo = this.argsMP.body;
    assert.equal(corpo.expires, true);
    const original = Payment.prototype.create;
    Payment.prototype.create = async function (args: any) { return args; } as any;
    try {
        const pix: any = await criarPixPedidoReal(this.dadosPedido);
        assert.equal(corpo.expiration_date_to, pix.body.date_of_expiration);
        assert.equal(corpo.expiration_date_to, formatarDataMP(this.dadosPedido.expiraEm));
    } finally {
        Payment.prototype.create = original;
    }
});

Then(
    "a preferência deve voltar para {string}, {string} e {string}",
    function (this: any, sucesso: string, pendente: string, falha: string) {
        const { back_urls } = this.argsMP.body;
        assert.ok(back_urls.success.endsWith(sucesso));
        assert.ok(back_urls.pending.endsWith(pendente));
        assert.ok(back_urls.failure.endsWith(falha));
    }
);

Then("o external_reference da preferência deve ser o pedido", function (this: any) {
    assert.equal(this.argsMP.body.external_reference, this.dadosPedido.pedidoId);
    assert.equal(this.argsMP.body.metadata.pedido_id, this.dadosPedido.pedidoId);
});

Then("a preferência não deve aceitar Pix", function (this: any) {
    const ids = this.argsMP.body.payment_methods.excluded_payment_methods.map((m: any) => m.id);
    assert.ok(ids.includes("pix"));
});

Then("o Pix montado deve ser de {int} reais", function (this: any, valor: number) {
    assert.equal(this.argsMP.body.transaction_amount, valor);
    assert.equal(this.argsMP.body.payment_method_id, "pix");
});

Then("o Pix montado deve ter o pedido no metadata", function (this: any) {
    assert.equal(this.argsMP.body.metadata.pedido_id, this.dadosPedido.pedidoId);
    assert.equal(this.argsMP.body.metadata.tipo, "RIFA");
});

Then("o Pix montado deve expirar em cerca de {int} minutos", function (this: any, minutos: number) {
    assert.equal(this.argsMP.body.date_of_expiration, formatarDataMP(this.dadosPedido.expiraEm));
    perto(this.dadosPedido.expiraEm, minutos);
});

// =========================== confirmar ===========================

Given("o Pix da reserva foi aprovado e o webhook chegou", async function (this: any) {
    aprovarPixNaApi(this);
    const r = await enviarWebhook(String(this.pix.paymentId));
    assert.equal(r.status, 200);
});

When("o Pix da reserva foi aprovado e o webhook chegou {int} vezes", async function (this: any, vezes: number) {
    aprovarPixNaApi(this);
    for (let i = 0; i < vezes; i++) assert.equal((await enviarWebhook(String(this.pix.paymentId))).status, 200);
});

When("o Pix da reserva foi aprovado com o valor {int} e o webhook chegou", async function (this: any, valor: number) {
    aprovarPixNaApi(this, valor);
    assert.equal((await enviarWebhook(String(this.pix.paymentId))).status, 200);
});

Given("o Pix da reserva foi aprovado no Mercado Pago", function (this: any) {
    aprovarPixNaApi(this);
});

When(
    "o Pix da reserva é aprovado e o webhook, a consulta do Pix e a consulta da compra chegam ao mesmo tempo",
    async function (this: any) {
        aprovarPixNaApi(this);
        const id = String(this.pix.paymentId);
        await Promise.all([
            enviarWebhook(id),
            request(app).get(`/api/rifa/status-pix/${id}?ref=${this.pix.rastreioId}`).set("X-Forwarded-For", this.ipCenario),
            request(app).get(`/api/rifa/compra?payment_id=${id}&ref=${this.reservaId}`).set("X-Forwarded-For", this.ipCenario),
            enviarWebhook(id),
        ]);
    }
);

Then(
    "os números {numeros} devem ter o nome, o e-mail e o WhatsApp de quem comprou",
    async function (numeros: number[]) {
        for (const numero of numeros) {
            const doc = await Rifa.findOne({ claimedNumber: numero }).lean();
            assert.equal(doc?.name, CONTATO.nome);
            assert.equal(doc?.email, CONTATO.email);
            assert.equal(doc?.phone, PHONE_DIGITOS);
            assert.ok(doc?.mpPaymentId);
        }
    }
);

Then(
    "deve ter sido enviado {int} e-mail de confirmação com os números {string}",
    function (quantidade: number, numeros: string) {
        const emails = emailsDeConfirmacao();
        assert.equal(emails.length, quantidade, emails.map((e) => e.subject).join(" | "));
        for (const e of emails) {
            assert.ok(e.subject.includes(numeros), e.subject);
            assert.equal(e.to, CONTATO.email);
        }
    }
);

Then("o painel deve ter recebido o pagamento do Pix da reserva", function (this: any) {
    assert.ok(getEnviosPainel().some((e) => e.mercadoPagoId === String(this.pix.paymentId)));
});

Then("o painel deve ter recebido o pagamento {string}", function (paymentId: string) {
    assert.ok(getEnviosPainel().some((e) => e.mercadoPagoId === paymentId));
});

Then("o pedido deve ter o alerta {string}", async function (this: any, alerta: string) {
    const pedido = await pedidoAtual(this);
    assert.ok(pedido!.alertas.includes(alerta as any), JSON.stringify(pedido!.alertas));
});

Given("a reserva venceu e outra pessoa comprou o número {int}", async function (this: any, numero: number) {
    await vencerReserva(this);
    await Rifa.deleteOne({ pedidoId: this.reservaId, claimedNumber: numero });
    await Rifa.create({ paymentId: `OUTRA-${numero}`, status: "APROVADO", amount: 100, claimedNumber: numero });
});

Given("a reserva venceu sem ninguém pegar os números", async function (this: any) {
    await vencerReserva(this);
    await Rifa.deleteMany({ pedidoId: this.reservaId, status: "RESERVADO" });
});

Then("o pedido deve ter {int} número a escolher", async function (this: any, quantidade: number) {
    const pedido = await pedidoAtual(this);
    assert.equal(pedido!.numerosAEscolher, quantidade);
    const aEscolher = await Rifa.find({ pedidoId: this.reservaId, status: "APROVADO", claimedNumber: null }).lean();
    assert.equal(aEscolher.length, quantidade);
    this.paymentIdAEscolher = aEscolher[0]?.paymentId;
});

Then("o e-mail de confirmação deve ter o link para escolher o número que faltou", async function (this: any) {
    const [email] = emailsDeConfirmacao();
    assert.ok(email, "nenhum e-mail de confirmação");
    const texto = await textoDoEmail(email);
    assert.ok(texto.includes(`/rifa/pagamento-aprovado?payment_id=${encodeURIComponent(this.paymentIdAEscolher)}`), texto);
});

Then("o número que faltou deve poder ser escolhido pelo fluxo de escolha", async function (this: any) {
    const r = await request(app).get(`/mercadopago/verificar-pagamento?payment_id=${encodeURIComponent(this.paymentIdAEscolher)}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.token);
});

When("outro pagamento aprovado do mesmo pedido chega pelo webhook", async function (this: any) {
    const original = getPagamentoFake(String(this.pix.paymentId))!;
    registrarPagamentoFakeNaAPI({ ...original, id: "889999", status: "approved", date_approved: new Date().toISOString() });
    assert.equal((await enviarWebhook("889999")).status, 200);
});

Then("o pedido deve ter {int} pagamento extra para estornar", async function (this: any, quantidade: number) {
    const pedido = await pedidoAtual(this);
    assert.equal(pedido!.pagamentosExtras.length, quantidade);
});

Then("não deve existir documento com o id do Pix da reserva", async function (this: any) {
    assert.equal(await Rifa.countDocuments({ paymentId: String(this.pix.paymentId) }), 0);
});

When("eu verifico o pagamento do Pix da reserva", async function (this: any) {
    this.lastResponse = await request(app).get(`/mercadopago/verificar-pagamento?payment_id=${this.pix.paymentId}`);
});

When("eu consulto o status do Pix da reserva", async function (this: any) {
    this.lastResponse = await request(app)
        .get(`/api/rifa/status-pix/${this.pix.paymentId}?ref=${this.pix.rastreioId}`)
        .set("X-Forwarded-For", this.ipCenario);
});

Then(
    "a consulta do Pix deve trazer a compra {string} com os números {numeros}",
    function (this: any, status: string, numeros: number[]) {
        const { data } = this.lastResponse.body;
        assert.equal(data.status, "APROVADO");
        assert.equal(data.compra.status, status);
        assert.deepEqual(data.compra.numerosConfirmados, numeros);
    }
);

function pagamentoCartao(world: any, id: string, status: string) {
    registrarPagamentoFakeNaAPI({
        id,
        status,
        transaction_amount: 200,
        payment_type_id: "credit_card",
        payment_method_id: "visa",
        external_reference: world.reservaId,
        ...(status === "approved" ? { date_approved: new Date().toISOString() } : {}),
        payer: { email: CONTATO.email },
        metadata: { tipo: "RIFA", pedido_id: world.reservaId, utm_campaign: "RIFA_SOLIDARIA", rastreio_id: world.reservaId },
    });
}

Given("o cartão da reserva foi aprovado no Mercado Pago com o id {string}", function (this: any, id: string) {
    pagamentoCartao(this, id, "approved");
});

Given("o cartão da reserva está em análise no Mercado Pago com o id {string}", function (this: any, id: string) {
    pagamentoCartao(this, id, "in_process");
});

When("eu consulto a compra com o pagamento {string}", async function (this: any, id: string) {
    this.lastResponse = await request(app)
        .get(`/api/rifa/compra?payment_id=${id}&ref=${this.reservaId}`)
        .set("X-Forwarded-For", this.ipCenario);
});

When("eu consulto a compra com o pagamento {string} e outro pedido", async function (this: any, id: string) {
    this.lastResponse = await request(app)
        .get(`/api/rifa/compra?payment_id=${id}&ref=${randomUUID()}`)
        .set("X-Forwarded-For", this.ipCenario);
});

Then("a compra deve estar {string} com os números {numeros}", function (this: any, status: string, numeros: number[]) {
    assert.equal(this.lastResponse.body.data.status, status);
    assert.deepEqual(this.lastResponse.body.data.numerosConfirmados, numeros);
});

Then("a compra deve estar {string} com o pagamento {string}", function (this: any, status: string, pagamento: string) {
    assert.equal(this.lastResponse.body.data.status, status);
    assert.equal(this.lastResponse.body.data.statusPagamento, pagamento);
});

// ---------- tarefas ----------

When("as tarefas da rifa rodam", async function () {
    await tarefasDosPedidos();
});

When("passam {int} dias e as tarefas da rifa rodam de novo", async function (dias: number) {
    await tarefasDosPedidos(new Date(Date.now() + dias * DIA));
});

Then("o pedido ainda deve ter o e-mail de quem comprou", async function (this: any) {
    assert.equal((await pedidoAtual(this))!.email, CONTATO.email);
});

Then("o pedido não deve ter mais nome, e-mail, WhatsApp nem IP", async function (this: any) {
    const pedido = await pedidoAtual(this);
    assert.equal(pedido!.nome, null);
    assert.equal(pedido!.email, null);
    assert.equal(pedido!.phone, null);
    assert.equal(pedido!.ipHash, null);
    assert.ok(pedido!.anonimizadoEm);
    assert.equal(pedido!.pagamento?.qrCode ?? null, null);
});

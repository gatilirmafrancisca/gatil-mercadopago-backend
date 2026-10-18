// scripts/recuperarPagamentosRifa.ts
//
// Encontra pagamentos da rifa aprovados no Mercado Pago que não chegaram ao
// banco — ex: Pix pago pelo Checkout Pro antigo, em que a pessoa não voltou
// ao site e o webhook não registrou — e os registra como APROVADO, sem
// número. Cada um ganha um link para a pessoa escolher o número.
//
// Uso:
//   npm run recuperar:rifa -- [--desde 2026-09-01] [--apply] [paymentId ...]
//
// Sem paymentIds, busca no Mercado Pago os pagamentos aprovados de R$ 100
// desde a data (padrão: 2026-08-01). Sem --apply, apenas lista.

import "dotenv/config";
import mongoose from "mongoose";
import { MercadoPagoConfig, Payment } from "mercadopago";
import Rifa from "../api/models/Rifa.js";
import * as RifaTypes from "../api/types/rifa.types.js";
import { sincronizarPagamentoRifa } from "../api/services/rifa.service.js";
import {
    ehPagamentoRifa,
    mapearStatusMP,
    sincronizarFinanceiroDoPagamento,
} from "../api/services/mercadoPago.service.js";

const args = process.argv.slice(2);
const aplicar = args.includes("--apply");
const indiceDesde = args.indexOf("--desde");
const desde = indiceDesde >= 0 ? args[indiceDesde + 1] : "2026-08-01";
const idsInformados = args.filter((a, i) => /^\d+$/.test(a) && i !== indiceDesde + 1);

if (args.includes("--help")) {
    console.log("Uso: npm run recuperar:rifa -- [--desde AAAA-MM-DD] [--apply] [paymentId ...]");
    console.log("Sem --apply, o comando apenas lista os pagamentos que faltam no banco.");
    process.exit(0);
}

const payment = new Payment(new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! }));

/** IDs dos pagamentos aprovados de R$ 100 desde a data, página a página. */
async function buscarCandidatos(): Promise<string[]> {
    const ids: string[] = [];
    const limit = 100;

    for (let offset = 0; ; offset += limit) {
        const pagina = await payment.search({
            options: {
                sort: "date_created",
                criteria: "asc",
                range: "date_created",
                begin_date: `${desde}T00:00:00.000-03:00`,
                end_date: "NOW",
                status: "approved",
                limit,
                offset,
            },
        });

        for (const p of pagina.results ?? []) {
            if (p.id && p.transaction_amount === RifaTypes.TICKET_PRICE_BRL) ids.push(String(p.id));
        }

        if (!pagina.results?.length || offset + limit >= (pagina.paging?.total ?? 0)) break;
    }

    return ids;
}

async function main() {
    const mongoUri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB_NAME;
    const frontendUrl = process.env.FRONTEND_URL ?? "";

    if (!mongoUri) throw new Error("MONGODB_URI não definida.");
    if (!dbName) throw new Error("MONGODB_DB_NAME não definida.");
    if (!process.env.MP_ACCESS_TOKEN) throw new Error("MP_ACCESS_TOKEN não definida.");

    await mongoose.connect(mongoUri, { dbName });

    const ids = idsInformados.length > 0 ? idsInformados : await buscarCandidatos();
    console.log(`${ids.length} pagamento(s) para conferir.`);

    let faltando = 0;

    for (const id of ids) {
        // A busca devolve um resumo: o metadata e a descrição vêm do get.
        const pagamento = await payment.get({ id });

        if (!ehPagamentoRifa(pagamento) || pagamento.status !== "approved") continue;

        const registro = await Rifa.findOne({ paymentId: String(pagamento.id) });
        if (registro?.status === "APROVADO") continue;

        faltando++;
        console.log(
            `\n- ${pagamento.id} · ${pagamento.payment_method_id} · ${pagamento.date_approved}` +
            ` · ${pagamento.payer?.email ?? "sem e-mail"}` +
            `${registro ? ` · no banco como ${registro.status}` : " · fora do banco"}`
        );
        console.log(`  link para escolher o número: ${frontendUrl}/rifa/pagamento-aprovado?payment_id=${pagamento.id}`);

        if (!aplicar) continue;

        await sincronizarPagamentoRifa(String(pagamento.id), {
            status: mapearStatusMP(pagamento.status),
            amount: RifaTypes.TICKET_PRICE_BRL,
            ...(pagamento.payer?.email ? { email: pagamento.payer.email } : {}),
        });

        await sincronizarFinanceiroDoPagamento(pagamento).catch((err) =>
            console.error("  falha ao sincronizar o painel:", err)
        );

        console.log("  registrado como APROVADO, sem número.");
    }

    console.log(`\n${faltando} pagamento(s) da rifa aprovado(s) faltando no banco.`);
    if (faltando > 0 && !aplicar) console.log("Nada foi alterado. Rode de novo com --apply para registrar.");

    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error(err);
    await mongoose.disconnect();
    process.exit(1);
});

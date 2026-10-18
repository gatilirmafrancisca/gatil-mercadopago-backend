// scripts/reconciliarPendentesRifa.ts
//
// Confere no Mercado Pago cada pagamento da rifa que está PENDENTE no banco:
// pago vira APROVADO (e o script imprime o link para a pessoa escolher o
// número; os lembretes por e-mail seguem pelas tarefas da rifa), Pix vencido
// ou recusado vira CANCELADO e deixa de ocupar vaga. O site e o Cron da
// Vercel (/api/rifa/tarefas-diarias) fazem o mesmo; este script é para rodar
// na hora, ou para conferir antes de aplicar.
//
// Uso:
//   npm run reconciliar:rifa             # só lista
//   npm run reconciliar:rifa -- --apply  # atualiza banco e painel

import "dotenv/config";
import mongoose from "mongoose";
import { reconciliarPendentesRifa } from "../api/services/rifa.service.js";

const aplicar = process.argv.slice(2).includes("--apply");

async function main() {
    const mongoUri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB_NAME;
    const frontendUrl = process.env.FRONTEND_URL ?? "";

    if (!mongoUri) throw new Error("MONGODB_URI não definida.");
    if (!dbName) throw new Error("MONGODB_DB_NAME não definida.");
    if (!process.env.MP_ACCESS_TOKEN) throw new Error("MP_ACCESS_TOKEN não definida.");

    await mongoose.connect(mongoUri, { dbName });

    const conferidos = await reconciliarPendentesRifa({ aplicar });
    console.log(`${conferidos.length} pagamento(s) PENDENTE(S) no banco.\n`);

    for (const { paymentId, status, email, teste, aplicado } of conferidos) {
        const acao = status === "PENDENTE" ? "segue pendente no Mercado Pago"
            : status === "ERRO" ? "não foi possível consultar o Mercado Pago"
            : aplicar ? (aplicado ? `atualizado para ${status}` : `não alterado (já não estava PENDENTE)`)
            : `vai virar ${status}`;

        console.log(`- ${paymentId}${teste ? " (teste)" : ""} · ${email ?? "sem e-mail"} · ${acao}`);
        if (status === "APROVADO") {
            console.log(`  link para escolher o número: ${frontendUrl}/rifa/pagamento-aprovado?payment_id=${paymentId}`);
        }
    }

    const mudam = conferidos.filter((c) => c.status === "APROVADO" || c.status === "CANCELADO").length;
    if (mudam > 0 && !aplicar) console.log("\nNada foi alterado. Rode de novo com --apply para atualizar.");

    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error(err);
    await mongoose.disconnect();
    process.exit(1);
});

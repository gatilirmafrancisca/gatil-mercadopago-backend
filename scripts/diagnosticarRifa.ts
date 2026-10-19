// scripts/diagnosticarRifa.ts
//
// Mostra, para cada pagamento da rifa ainda sem número (PENDENTE ou APROVADO),
// o que está no banco e o que o Mercado Pago tem: meio de pagamento, status,
// expiração, e-mail e nome de quem pagou. Serve pra entender por que um
// pagamento está "reservado" há dias ou sem e-mail (sem e-mail, não sai
// lembrete). Também confere se as variáveis de envio de e-mail existem.
//
// Uso:
//   npm run diagnosticar:rifa             # só mostra
//   npm run diagnosticar:rifa -- --apply  # também grava os contatos encontrados no MP

import "dotenv/config";
import mongoose from "mongoose";
import Rifa from "../api/models/Rifa.js";
import { buscarPagamento } from "../api/mercadoPago/buscarPagamento.js";
import { completarContatosRifa, statusRifaDoPagamento } from "../api/services/rifa.service.js";
import { bancoDoPagador, emailDoPagamento, metodoDoPagamento, nomeDoPagador } from "../api/services/mercadoPago.service.js";

const aplicar = process.argv.slice(2).includes("--apply");
const definida = (nome: string) => (process.env[nome] ? "ok" : "NÃO DEFINIDA");
const data = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");

async function main() {
    const mongoUri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB_NAME;

    if (!mongoUri) throw new Error("MONGODB_URI não definida.");
    if (!dbName) throw new Error("MONGODB_DB_NAME não definida.");
    if (!process.env.MP_ACCESS_TOKEN) throw new Error("MP_ACCESS_TOKEN não definida.");

    console.log("Variáveis de e-mail e tarefas (confira também na Vercel):");
    for (const nome of ["RESEND_API_KEY", "EMAIL_FROM", "FRONTEND_URL", "CRON_SECRET"]) {
        console.log(`  ${nome}: ${definida(nome)}`);
    }

    await mongoose.connect(mongoUri, { dbName });

    const registros = await Rifa.find({
        status: { $in: ["PENDENTE", "APROVADO"] },
        claimedNumber: null,
    }).sort({ _id: 1 }).lean();

    console.log(`\n${registros.length} pagamento(s) sem número no banco.\n`);

    for (const r of registros) {
        console.log(`- ${r.paymentId}${r.teste ? " (teste)" : ""} · banco: ${r.status}`);
        console.log(`    banco → e-mail: ${r.email ?? "—"} · nome: ${r.nomePagador ?? "—"} · criado: ${data(r._id.getTimestamp())}`);
        console.log(`            aprovadoEm: ${data(r.aprovadoEm)} · lembretes enviados: ${(r.lembretesEnviados ?? []).join(", ") || "nenhum"}`);

        if (r.paymentId.startsWith("MANUAL-")) {
            console.log("    (cadastro manual: não existe no Mercado Pago)\n");
            continue;
        }

        try {
            const p = await buscarPagamento(r.paymentId);
            console.log(
                `    MP    → ${p.payment_method_id}/${p.payment_type_id} · ${p.status} (${p.status_detail})` +
                ` · criado: ${data(p.date_created)} · expira: ${data(p.date_of_expiration)} · aprovado: ${data(p.date_approved)}`
            );
            console.log(
                `            payer.email: ${p.payer?.email || "—"} · email_contato: ${p.metadata?.email_contato || "—"}` +
                ` · nome: ${nomeDoPagador(p) ?? "—"} · banco: ${bancoDoPagador(p) ?? "—"} · meio: ${metodoDoPagamento(p) ?? "—"}`
            );
            console.log(`    tarefas → status ${statusRifaDoPagamento(p)} · e-mail usado: ${emailDoPagamento(p) ?? "nenhum (informe no painel)"}\n`);
        } catch (err: any) {
            console.log(`    MP    → erro ao consultar: ${err?.message ?? err}\n`);
        }
    }

    if (aplicar) {
        const contatos = await completarContatosRifa({ aplicar: true });
        const comEmail = contatos.filter((c) => c.email);
        console.log(`Contatos conferidos no MP: ${contatos.length} · e-mails encontrados: ${comEmail.length}`);
        for (const c of comEmail) console.log(`  ${c.paymentId} → ${c.email}`);
        console.log("Os lembretes saem na próxima execução das tarefas (site ou Cron diário).");
    } else {
        console.log("Nada foi alterado. Rode com -- --apply para gravar os contatos encontrados no Mercado Pago.");
    }

    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error(err);
    await mongoose.disconnect();
    process.exit(1);
});

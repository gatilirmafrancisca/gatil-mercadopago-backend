import "dotenv/config";
import mongoose from "mongoose";
import Rifa from "../api/models/Rifa.js";

const STATUS_MAP: Record<string, "PENDENTE" | "APROVADO" | "CANCELADO"> = {
    pendente: "PENDENTE",
    PENDENTE: "PENDENTE",
    confirmado: "APROVADO",
    aprovado: "APROVADO",
    APROVADO: "APROVADO",
    cancelado: "CANCELADO",
    CANCELADO: "CANCELADO",
};

const aplicar = process.argv.includes("--apply");

if (process.argv.includes("--help")) {
    console.log("Uso: npm run migrate:rifa-status -- [--apply]");
    console.log("Sem --apply, o comando apenas lista as alterações previstas.");
    process.exit(0);
}

async function main() {
    const mongoUri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB_NAME;

    if (!mongoUri) throw new Error("MONGODB_URI não definida.");
    if (!dbName) throw new Error("MONGODB_DB_NAME não definida.");

    await mongoose.connect(mongoUri, { dbName });

    const documentos = await Rifa.find({}, { _id: 1, status: 1 }).lean();
    const alteracoes = documentos.flatMap((documento) => {
        const statusAtual = String(documento.status);
        const statusNovo = STATUS_MAP[statusAtual];
        return statusNovo && statusNovo !== statusAtual
            ? [{ id: documento._id, de: statusAtual, para: statusNovo }]
            : [];
    });

    console.log(`Banco: ${dbName}`);
    console.log(`Documentos analisados: ${documentos.length}`);
    console.log(`Documentos que serão atualizados: ${alteracoes.length}`);

    for (const alteracao of alteracoes) {
        console.log(`${alteracao.id}: ${alteracao.de} -> ${alteracao.para}`);
    }
    if (!aplicar) {
        console.log("Modo dry-run. Nada foi alterado. Use --apply para aplicar.");
        return;
    }

    for (const alteracao of alteracoes) {
        await Rifa.updateOne(
            { _id: alteracao.id as any, status: alteracao.de as any } as any,
            { $set: { status: alteracao.para } },
        );
    }

    console.log(`Atualizações aplicadas: ${alteracoes.length}`);
}

main()
    .catch((error) => {
        console.error("Falha na migração de status da rifa:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });

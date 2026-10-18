// scripts/sincronizarIndices.ts
//
// Deixa os índices da coleção de rifas iguais aos do schema (api/models/Rifa.ts):
// cria os que faltam e remove os que não existem mais — ex: o índice único
// antigo { claimedNumber: 1 }, trocado por { claimedNumber: 1, teste: 1 }
// para o Pix de teste não bloquear um número real.
//
// Uso:
//   npm run migrate:indices             # só mostra o que muda
//   npm run migrate:indices -- --apply  # aplica

import "dotenv/config";
import mongoose from "mongoose";
import Rifa from "../api/models/Rifa.js";

const aplicar = process.argv.includes("--apply");

async function main() {
    const mongoUri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB_NAME;

    if (!mongoUri) throw new Error("MONGODB_URI não definida.");
    if (!dbName) throw new Error("MONGODB_DB_NAME não definida.");

    await mongoose.connect(mongoUri, { dbName, autoIndex: false });

    const { toCreate, toDrop } = await Rifa.diffIndexes();
    console.log("Índices a criar:", toCreate.length ? JSON.stringify(toCreate) : "nenhum");
    console.log("Índices a remover:", toDrop.length ? toDrop.join(", ") : "nenhum");

    if (aplicar) {
        await Rifa.syncIndexes();
        console.log("Índices sincronizados.");
    } else if (toCreate.length || toDrop.length) {
        console.log("Nada foi alterado. Rode de novo com --apply para aplicar.");
    }

    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error(err);
    await mongoose.disconnect();
    process.exit(1);
});

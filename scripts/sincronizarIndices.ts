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
import Pedido from "../api/models/Pedido.js";

const aplicar = process.argv.includes("--apply");

async function main() {
    const mongoUri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB_NAME;

    if (!mongoUri) throw new Error("MONGODB_URI não definida.");
    if (!dbName) throw new Error("MONGODB_DB_NAME não definida.");

    await mongoose.connect(mongoUri, { dbName, autoIndex: false });

    let mudancas = 0;
    // rifas: índice único do número e TTL das reservas vencidas.
    // pedidos: compras com reserva (models/Pedido.ts).
    for (const modelo of [Rifa, Pedido] as const) {
        const { toCreate, toDrop } = await (modelo as typeof Rifa).diffIndexes();
        mudancas += toCreate.length + toDrop.length;
        console.log(`[${modelo.collection.name}] índices a criar:`, toCreate.length ? JSON.stringify(toCreate) : "nenhum");
        console.log(`[${modelo.collection.name}] índices a remover:`, toDrop.length ? toDrop.join(", ") : "nenhum");
        if (aplicar) await (modelo as typeof Rifa).syncIndexes();
    }

    if (aplicar) {
        console.log("Índices sincronizados.");
    } else if (mudancas) {
        console.log("Nada foi alterado. Rode de novo com --apply para aplicar.");
    }

    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error(err);
    await mongoose.disconnect();
    process.exit(1);
});

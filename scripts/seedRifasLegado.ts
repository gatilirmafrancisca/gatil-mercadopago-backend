// scripts/seedRifasLegado.ts
//
// Insere os 81 números já vendidos manualmente (planilha antiga) no
// banco, através do Model Rifa — não é um insertMany cru direto no
// Mongo, então passa pelos mesmos índices/tipagem do schema real.
//
// Uso:
//   npx tsx scripts/seedRifasLegado.ts
//
// Roda contra o banco apontado pelo MONGODB_URI do .env carregado no
// momento — ou seja, aponte o .env pro ambiente de TESTE primeiro,
// confira os documentos, e só depois repita apontando pro ambiente
// real, trocando o .env (ou passando a URI via variável de ambiente
// na hora de rodar).

import "dotenv/config";
import mongoose from "mongoose";
import Rifa from "../api/models/Rifa.js";
import dadosLegado from "./rifas_legado.json" with { type: "json" };

async function main() {
    const mongoUri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB_NAME;

    if (!mongoUri) {
        throw new Error("MONGODB_URI não definida no .env carregado.");
    }
    if (!dbName) {
        throw new Error("MONGODB_DB_NAME não definida no .env carregado.");
    }

    // Sem passar dbName explicitamente, o driver do Mongo cai no banco
    // padrão "test" quando a URI não tem o nome do banco no path — foi
    // exatamente isso que criou o banco "test" indevido da vez passada.
    await mongoose.connect(mongoUri, { dbName });
    console.log(`Conectado em: ${mongoUri.replace(/\/\/.*@/, "//<credenciais>@")} · banco: ${dbName}`);

    // ordered: false — se um documento específico falhar (ex: número
    // já existir de um teste anterior), os outros continuam sendo
    // inseridos, em vez de tudo parar no primeiro erro.
    const dadosParaInserir = dadosLegado.map((rifa) => ({
        ...rifa,
        status: rifa.status === "confirmado" ? "APROVADO" : rifa.status,
    }));

    const resultado = await Rifa.insertMany(dadosParaInserir, {
        ordered: false,
        rawResult: true,
    }).catch((err) => err); // insertMany com ordered:false lança mesmo com sucesso parcial

    if (resultado?.insertedCount !== undefined) {
        console.log(`Inseridos: ${resultado.insertedCount} de ${dadosLegado.length}`);
    } else if (resultado?.result?.nInserted !== undefined) {
        console.log(`Inseridos: ${resultado.result.nInserted} de ${dadosLegado.length}`);
        const falhas = resultado.writeErrors ?? [];
        if (falhas.length > 0) {
            console.log(`${falhas.length} falharam (provavelmente já existiam):`);
            for (const f of falhas) {
                console.log(` - claimedNumber ${dadosParaInserir[f.index]?.claimedNumber}: ${f.errmsg}`);
            }
        }
    } else {
        console.log("Todos os documentos inseridos sem erro.");
    }

    await mongoose.disconnect();
}

main().catch((err) => {
    console.error("Falha ao rodar a migração:", err);
    process.exit(1);
});
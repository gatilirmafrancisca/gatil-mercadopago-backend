// O painel-adm recebe cada pagamento em POST {PAINEL_ADM_URL}/financeiro/interno/mercadopago.
// Nos testes, o fetch para o painel é interceptado e o corpo guardado; qualquer
// outra URL segue para o fetch real.

export const PAINEL_URL_TESTE = "http://painel.teste";

export interface EnvioPainel {
    mercadoPagoId: string;
    valor: number;
    status: string;
    utmSource: string;
    utmMedium: string;
    utmCampaign: string;
    nomeDoador: string;
    emailDoador?: string;
    descricao?: string;
    metodoPagamento: string;
    tipo: string;
    dataConfirmacao: string;
}

const enviosPainel: EnvioPainel[] = [];
const fetchReal = globalThis.fetch;

export function getEnviosPainel() {
    return enviosPainel;
}

/** Chamado no Before de cada cenário. */
export function resetarPainelFake() {
    enviosPainel.length = 0;

    globalThis.fetch = (async (entrada: any, init?: any) => {
        const url = String(entrada instanceof Request ? entrada.url : entrada);
        if (!url.startsWith(PAINEL_URL_TESTE)) return fetchReal(entrada, init);

        if (url.endsWith("/financeiro/interno/mercadopago") && init?.method === "POST") {
            enviosPainel.push(JSON.parse(String(init.body)));
            return new Response(JSON.stringify({ message: "ok" }), { status: 201 });
        }
        return new Response(JSON.stringify({ data: { total: 0 } }), { status: 200 });
    }) as typeof fetch;
}

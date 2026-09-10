import { mercadoPagoClient } from "../../api/mercadoPago/buscarPagamento.js";
import { mercadoPagoPreferenceClient } from "../../api/mercadoPago/criarPreferenciaRifa.js";

interface PagamentoFake {
    id: string;
    status: string;
    transaction_amount: number;
    payer?: { email?: string };
    metadata?: { utm_campaign?: string };
}

const pagamentosFake = new Map<string, PagamentoFake>();
let chamadasCriarPreferencia = 0;

export function registrarPagamentoFakeNaAPI(pagamento: PagamentoFake) {
    pagamentosFake.set(pagamento.id, pagamento);
}

export function getChamadasCriarPreferencia() {
    return chamadasCriarPreferencia;
}

/**
 * Chamado no Before de cada cenário — troca as chamadas reais do
 * Mercado Pago pelas fakes, e limpa o estado do cenário anterior.
 */
export function resetarFakesMercadoPago() {
    pagamentosFake.clear();
    chamadasCriarPreferencia = 0;

    mercadoPagoClient.buscarPagamento = async (paymentId: string) => {
        const encontrado = pagamentosFake.get(paymentId);
        if (!encontrado) {
            throw new Error(
                `Pagamento fake '${paymentId}' não foi configurado neste cenário — falta um "Dado que existe..." pra ele.`
            );
        }
        return encontrado as any;
    };

    mercadoPagoPreferenceClient.criar = async () => {
        chamadasCriarPreferencia++;
        return { init_point: "https://mercadopago.com.br/checkout/fake" } as any;
    };
}
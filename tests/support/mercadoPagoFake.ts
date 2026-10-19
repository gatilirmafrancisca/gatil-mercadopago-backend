import { mercadoPagoClient } from "../../api/mercadoPago/buscarPagamento.js";
import { mercadoPagoPreferenceClient } from "../../api/mercadoPago/criarPreferenciaRifa.js";
import { mercadoPagoDoacaoClient } from "../../api/mercadoPago/criarPreferenciaDoacao.js";
import { mercadoPagoPixClient } from "../../api/mercadoPago/criarPixDoacao.js";
import { mercadoPagoPixRifaClient } from "../../api/mercadoPago/criarPixRifa.js";

interface PagamentoFake {
    id: string;
    status: string;
    status_detail?: string;
    transaction_amount: number;
    transaction_details?: { net_received_amount?: number };
    description?: string;
    external_reference?: string;
    date_created?: string;
    date_approved?: string;
    date_of_expiration?: string;
    payer?: { email?: string | null; first_name?: string; last_name?: string };
    payment_method_id?: string;
    payment_type_id?: string;
    point_of_interaction?: { transaction_data?: { bank_info?: { payer?: { long_name?: string } } } };
    card?: { cardholder?: { name?: string } };
    metadata?: {
        utm_source?: string | null;
        utm_medium?: string | null;
        utm_campaign?: string | null;
        tipo?: string;
        rastreio_id?: string;
        valor_esperado?: number;
        teste?: boolean;
        email_contato?: string;
    };
}

const pagamentosFake = new Map<string, PagamentoFake>();
let chamadasCriarPreferencia = 0;
const pedidosPix: Parameters<typeof mercadoPagoPixClient.criar>[0][] = [];
const pedidosPixRifa: Parameters<typeof mercadoPagoPixRifaClient.criar>[0][] = [];

// Guardado antes de ser trocado pela fake: os testes do corpo enviado ao
// Mercado Pago chamam a função real, com o SDK interceptado.
export const criarPixReal = mercadoPagoPixClient.criar;
export const criarPixRifaReal = mercadoPagoPixRifaClient.criar;
// A preferência da doação não é trocada por fake; a da rifa é.
export const criarPreferenciaRealRifa = mercadoPagoPreferenceClient.criar;
export const criarPreferenciaRealDoacao = mercadoPagoDoacaoClient.criar;

export const PIX_FAKE = {
    id: 777000111,
    rastreioId: "2b9f4c1e-8a7d-4e2b-9c3f-5d6e7f8a9b0c",
    qrCode: "00020126580014br.gov.bcb.pix0136fake-gatil",
    qrCodeBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    expiraEm: "2026-10-11T21:00:00.000-03:00",
};

export function registrarPagamentoFakeNaAPI(pagamento: PagamentoFake) {
    pagamentosFake.set(pagamento.id, pagamento);
}

export function getChamadasCriarPreferencia() {
    return chamadasCriarPreferencia;
}

export function getPedidosPix() {
    return pedidosPix;
}

export function getPedidosPixRifa() {
    return pedidosPixRifa;
}

/**
 * Chamado no Before de cada cenário — troca as chamadas reais do
 * Mercado Pago pelas fakes, e limpa o estado do cenário anterior.
 */
export function resetarFakesMercadoPago() {
    pagamentosFake.clear();
    chamadasCriarPreferencia = 0;
    pedidosPix.length = 0;
    pedidosPixRifa.length = 0;

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

    mercadoPagoPixClient.criar = async (dados) => {
        pedidosPix.push(dados);
        return {
            id: PIX_FAKE.id,
            status: "pending",
            external_reference: PIX_FAKE.rastreioId,
            date_of_expiration: PIX_FAKE.expiraEm,
            point_of_interaction: {
                transaction_data: { qr_code: PIX_FAKE.qrCode, qr_code_base64: PIX_FAKE.qrCodeBase64 },
            },
        } as any;
    };

    mercadoPagoPixRifaClient.criar = async (dados) => {
        pedidosPixRifa.push(dados);
        return {
            id: PIX_FAKE.id,
            status: "pending",
            external_reference: PIX_FAKE.rastreioId,
            date_of_expiration: PIX_FAKE.expiraEm,
            point_of_interaction: {
                transaction_data: { qr_code: PIX_FAKE.qrCode, qr_code_base64: PIX_FAKE.qrCodeBase64 },
            },
        } as any;
    };
}

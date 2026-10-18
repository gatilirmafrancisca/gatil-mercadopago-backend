import { Resend } from "resend";
import type { ReactElement } from "react";
import { ConfirmacaoNumeroEmail } from "../emails/confirmacaoNumeroEmail.js";
import { EscolhaNumeroEmail } from "../emails/escolhaNumeroEmail.js";

// Igual fizemos com o MercadoPagoConfig: construir dentro da função,
// não no topo do arquivo — senão qualquer import desse módulo (mesmo
// em testes que nunca chegam a enviar e-mail) já quebra se
// RESEND_API_KEY não estiver definida no ambiente.
function getResendClient() {
    return new Resend(process.env.RESEND_API_KEY);
}

interface EmailParaEnviar {
    to: string;
    subject: string;
    react: ReactElement;
}

// Objeto mutável de propósito — os testes trocam o envio real por um fake
// (ver tests/support/emailFake.ts), como no mercadoPagoClient.
export const emailClient = {
    async enviar({ to, subject, react }: EmailParaEnviar): Promise<{ error: unknown }> {
        const { error } = await getResendClient().emails.send({
            from: process.env.EMAIL_FROM!,
            to,
            subject,
            react,
        });
        return { error };
    },
};

/** Nunca lança erro: falha de envio só é logada (ver enviarEmailConfirmacao). */
async function enviar(email: EmailParaEnviar, contexto: string): Promise<boolean> {
    try {
        const { error } = await emailClient.enviar(email);

        if (error) {
            console.error(`[email] Resend devolveu erro (${contexto}):`, email.to, error);
            return false;
        }

        return true;
    } catch (err) {
        // Cobre tanto falha de rede quanto o construtor do Resend
        // reclamando de API key ausente (comum em ambiente de teste,
        // onde RESEND_API_KEY não é definida de propósito).
        console.error(`[email] falha ao enviar ${contexto}`, email.to, err);
        return false;
    }
}

const prefixoTeste = (teste?: boolean) => (teste ? "[TESTE] " : "");

interface EnviarEmailConfirmacaoArgs {
    name: string;
    email: string;
    claimedNumber: number;
    /** Número sorteado porque o prazo de escolha venceu. */
    sorteado?: boolean;
    /** Pix de teste de R$ 0,01. */
    teste?: boolean;
}

/**
 * Dispara o e-mail de confirmação. Nunca lança erro pra quem chamou —
 * uma falha de envio não pode derrubar uma confirmação de número que
 * já foi salva com sucesso no banco. Falhas ficam só logadas, pra
 * reenvio manual (ver reenviarEmail.controller.ts).
 */
export async function enviarEmailConfirmacao({
    name,
    email,
    claimedNumber,
    sorteado = false,
    teste = false,
}: EnviarEmailConfirmacaoArgs): Promise<boolean> {
    return enviar({
        to: email,
        subject: `${prefixoTeste(teste)}Seu número na Rifa Solidária: ${String(claimedNumber).padStart(3, "0")}`,
        react: ConfirmacaoNumeroEmail({ name, claimedNumber, sorteado }),
    }, "confirmação");
}

interface EnviarEmailEscolhaNumeroArgs {
    email: string;
    paymentId: string;
    diasRestantes: number;
    prazo: Date;
    teste?: boolean;
}

/** Lembrete de que o pagamento foi aprovado e o número ainda não foi escolhido. */
export async function enviarEmailEscolhaNumero({
    email,
    paymentId,
    diasRestantes,
    prazo,
    teste = false,
}: EnviarEmailEscolhaNumeroArgs): Promise<boolean> {
    const linkEscolha = `${process.env.FRONTEND_URL ?? ""}/rifa/pagamento-aprovado?payment_id=${encodeURIComponent(paymentId)}`;
    const prazoFormatado = prazo.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "America/Sao_Paulo",
    });

    return enviar({
        to: email,
        subject: diasRestantes <= 1
            ? `${prefixoTeste(teste)}Último dia para escolher seu número da Rifa Solidária`
            : `${prefixoTeste(teste)}Escolha seu número da Rifa Solidária — faltam ${diasRestantes} dias`,
        react: EscolhaNumeroEmail({ linkEscolha, diasRestantes, prazoFormatado }),
    }, "escolha de número");
}

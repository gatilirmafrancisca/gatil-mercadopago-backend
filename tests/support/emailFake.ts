import { render } from "@react-email/components";
import { emailClient } from "../../api/services/email.service.js";

// Os testes nunca falam com o Resend: cada envio é guardado aqui.
interface EmailEnviado {
    to: string;
    subject: string;
    react: Parameters<typeof emailClient.enviar>[0]["react"];
}

const emailsEnviados: EmailEnviado[] = [];

export function getEmailsEnviados() {
    return emailsEnviados;
}

/** Texto do e-mail, como a pessoa lê. */
export function textoDoEmail(email: EmailEnviado): Promise<string> {
    return render(email.react, { plainText: true });
}

/** Chamado no Before de cada cenário. */
export function resetarEmailFake() {
    emailsEnviados.length = 0;
    emailClient.enviar = async (email) => {
        emailsEnviados.push(email);
        return { error: null };
    };
}

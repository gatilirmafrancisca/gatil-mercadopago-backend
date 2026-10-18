import { createElement as h } from "react";
import {
    Html,
    Head,
    Preview,
    Body,
    Container,
    Section,
    Heading,
    Text,
    Button,
} from "@react-email/components";

interface EscolhaNumeroEmailProps {
    linkEscolha: string;
    diasRestantes: number;
    /** Data (dd/mm) em que o número será sorteado, se ninguém escolher. */
    prazoFormatado: string;
}

const cores = {
    verde: "#368c5e",
    verdeEscuro: "#1a5331",
    laranja: "#ff9d3b",
    neutro: "#f7f7f7",
    carvao: "#1e1b1c",
};

// Mesmo padrão do confirmacaoNumeroEmail.ts: h(Tag, props, ...filhos), sem JSX.
export function EscolhaNumeroEmail({ linkEscolha, diasRestantes, prazoFormatado }: EscolhaNumeroEmailProps) {
    const ultimoDia = diasRestantes <= 1;
    const prazoTexto = ultimoDia
        ? "Hoje é o último dia para escolher o seu número."
        : `Faltam ${diasRestantes} dias para escolher o seu número.`;

    return h(
        Html,
        null,
        h(Head, null),
        h(Preview, null, `Pagamento confirmado — escolha seu número da Rifa Solidária. ${prazoTexto}`),
        h(
            Body,
            { style: { backgroundColor: cores.neutro, fontFamily: "sans-serif" } },
            h(
                Container,
                {
                    style: {
                        backgroundColor: "#ffffff",
                        borderRadius: "16px",
                        padding: "32px",
                        margin: "24px auto",
                        maxWidth: "440px",
                    },
                },
                h(
                    Section,
                    { style: { textAlign: "center", marginBottom: "16px" } },
                    h(
                        Text,
                        {
                            style: {
                                fontSize: "13px",
                                fontWeight: 700,
                                color: cores.verdeEscuro,
                                letterSpacing: "0.5px",
                                textTransform: "uppercase",
                            },
                        },
                        "Gatil Irmã Francisca · Ação Solidária"
                    )
                ),
                h(
                    Heading,
                    {
                        style: {
                            color: cores.verdeEscuro,
                            fontSize: "22px",
                            textAlign: "center",
                            margin: "0 0 8px",
                        },
                    },
                    "Seu pagamento foi confirmado — escolha seu número 🐾"
                ),
                h(
                    Text,
                    {
                        style: {
                            textAlign: "center",
                            color: ultimoDia ? cores.laranja : cores.carvao,
                            fontSize: "15px",
                            fontWeight: 700,
                            lineHeight: "22px",
                        },
                    },
                    prazoTexto
                ),
                h(
                    Section,
                    { style: { textAlign: "center", margin: "24px 0" } },
                    h(
                        Button,
                        {
                            href: linkEscolha,
                            style: {
                                backgroundColor: cores.verde,
                                color: "#ffffff",
                                borderRadius: "10px",
                                padding: "12px 24px",
                                fontSize: "15px",
                                fontWeight: 700,
                                textDecoration: "none",
                            },
                        },
                        "Escolher meu número"
                    )
                ),
                h(
                    Text,
                    {
                        style: {
                            textAlign: "center",
                            color: cores.carvao,
                            fontSize: "13px",
                            lineHeight: "20px",
                        },
                    },
                    `Se nenhum número for escolhido até ${prazoFormatado}, um número livre será sorteado para você e enviado por e-mail.`
                ),
                h(
                    Text,
                    {
                        style: {
                            fontSize: "11px",
                            color: "#9a9a92",
                            textAlign: "center",
                            marginTop: "24px",
                        },
                    },
                    "Gatil Irmã Francisca — CNPJ 25.382.038/0001-05"
                )
            )
        )
    );
}

export default EscolhaNumeroEmail;

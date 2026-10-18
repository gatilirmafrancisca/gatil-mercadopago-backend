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
    Hr,
} from "@react-email/components";

interface ConfirmacaoNumeroEmailProps {
    name: string;
    claimedNumber: number;
    /** O prazo de escolha venceu e o número foi sorteado (lembretes.service.ts). */
    sorteado?: boolean;
}

const cores = {
    verde: "#368c5e",
    verdeEscuro: "#1a5331",
    laranja: "#ff9d3b",
    creme: "#fffccc",
    neutro: "#f7f7f7",
    carvao: "#1e1b1c",
};

// Mesmo template de antes, só que sem sintaxe JSX — h(Tag, props, ...filhos)
// no lugar de <Tag>filhos</Tag>. Isso deixa o arquivo como .ts puro, sem
// precisar de .tsx, que é onde o build da Vercel estava travando.
export function ConfirmacaoNumeroEmail({ name, claimedNumber, sorteado = false }: ConfirmacaoNumeroEmailProps) {
    const numeroFormatado = String(claimedNumber).padStart(3, "0");

    return h(
        Html,
        null,
        h(Head, null),
        h(Preview, null, `Seu número na Rifa Solidária do Gatil: ${numeroFormatado}`),
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
                            fontSize: "24px",
                            textAlign: "center",
                            margin: "0 0 8px",
                        },
                    },
                    `Prontinho, ${name}! 🐾`
                ),
                h(
                    Text,
                    {
                        style: {
                            textAlign: "center",
                            color: cores.carvao,
                            fontSize: "14px",
                            lineHeight: "22px",
                        },
                    },
                    "Sua participação na Rifa Solidária está confirmada."
                ),
                sorteado
                    ? h(
                        Text,
                        {
                            style: {
                                textAlign: "center",
                                color: cores.carvao,
                                fontSize: "13px",
                                lineHeight: "20px",
                            },
                        },
                        "Como nenhum número foi escolhido no prazo, sorteamos um número livre para você."
                    )
                    : null,
                h(
                    Section,
                    { style: { textAlign: "center", margin: "24px 0" } },
                    h(
                        Text,
                        {
                            style: {
                                fontSize: "12px",
                                fontWeight: 700,
                                color: "#8a8a84",
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                                margin: "0 0 4px",
                            },
                        },
                        "Seu número"
                    ),
                    h(
                        Text,
                        {
                            style: {
                                fontSize: "44px",
                                fontWeight: 700,
                                color: cores.laranja,
                                margin: 0,
                            },
                        },
                        numeroFormatado
                    )
                ),
                h(Hr, { style: { borderColor: "#e3e3dd", margin: "20px 0" } }),
                h(
                    Text,
                    {
                        style: {
                            fontSize: "13px",
                            lineHeight: "20px",
                            color: cores.carvao,
                            textAlign: "center",
                        },
                    },
                    "O sorteio é ",
                    h("strong", null, "ao vivo, no Instagram do Gatil"),
                    ", no dia ",
                    h("strong", null, "07/09"),
                    ". Boa sorte!"
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

export default ConfirmacaoNumeroEmail;
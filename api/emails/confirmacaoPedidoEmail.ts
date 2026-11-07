import { createElement as h } from "react";
import { Html, Head, Preview, Body, Container, Section, Heading, Text, Hr, Link } from "@react-email/components";
import { DATA_SORTEIO_LABEL } from "../types/rifa.types.js";

interface ConfirmacaoPedidoEmailProps {
    name: string;
    /** Números que ficaram com a pessoa. */
    numeros: number[];
    /** Links para escolher os números que se perderam (pagamento aprovado depois da reserva vencer). */
    linksEscolha: string[];
}

const cores = { verdeEscuro: "#1a5331", laranja: "#ff9d3b", neutro: "#f7f7f7", carvao: "#1e1b1c" };
const pad = (n: number) => String(n).padStart(3, "0");
const texto = { textAlign: "center" as const, color: cores.carvao, fontSize: "14px", lineHeight: "22px" };

/** Confirmação de uma compra com reserva (um ou vários números). Sem JSX: ver confirmacaoNumeroEmail.ts. */
export function ConfirmacaoPedidoEmail({ name, numeros, linksEscolha }: ConfirmacaoPedidoEmailProps) {
    const varios = numeros.length + linksEscolha.length > 1;

    return h(
        Html,
        null,
        h(Head, null),
        h(Preview, null, numeros.length
            ? `Seus números na Ação Solidária do Gatil: ${numeros.map(pad).join(", ")}`
            : "Seu pagamento na Ação Solidária do Gatil foi confirmado"),
        h(
            Body,
            { style: { backgroundColor: cores.neutro, fontFamily: "sans-serif" } },
            h(
                Container,
                { style: { backgroundColor: "#ffffff", borderRadius: "16px", padding: "32px", margin: "24px auto", maxWidth: "440px" } },
                h(Text, { style: { ...texto, fontSize: "13px", fontWeight: 700, color: cores.verdeEscuro, textTransform: "uppercase" } },
                    "Gatil Irmã Francisca · Ação Solidária de Natal"),
                h(Heading, { style: { color: cores.verdeEscuro, fontSize: "24px", textAlign: "center", margin: "0 0 8px" } },
                    `Prontinho, ${name}! 🎄`),
                h(Text, { style: texto }, "Seu pagamento foi confirmado e a sua participação está garantida."),
                numeros.length
                    ? h(
                        Section,
                        { style: { textAlign: "center", margin: "24px 0" } },
                        h(Text, { style: { fontSize: "12px", fontWeight: 700, color: "#8a8a84", textTransform: "uppercase", margin: "0 0 4px" } },
                            varios ? "Seus números" : "Seu número"),
                        h(Text, { style: { fontSize: numeros.length > 3 ? "28px" : "40px", fontWeight: 700, color: cores.laranja, margin: 0 } },
                            numeros.map(pad).join(" · "))
                    )
                    : null,
                linksEscolha.length
                    ? h(
                        Section,
                        { style: { margin: "16px 0" } },
                        h(Text, { style: texto },
                            linksEscolha.length === 1
                                ? "Um dos números que você reservou foi tirado por outra pessoa antes do pagamento ser confirmado. Escolha outro número livre por este link:"
                                : `${linksEscolha.length} números que você reservou foram tirados por outras pessoas antes do pagamento ser confirmado. Escolha outros números livres por estes links:`),
                        ...linksEscolha.map((link, i) =>
                            h(Text, { key: link, style: { ...texto, margin: "4px 0" } },
                                h(Link, { href: link, style: { color: cores.verdeEscuro, fontWeight: 700 } }, `Escolher o ${i + 1}º número`))
                        ),
                        h(Text, { style: { ...texto, fontSize: "12px" } },
                            "Você tem 20 dias. Se não escolher nesse prazo, sorteamos um número livre e avisamos por e-mail.")
                    )
                    : null,
                h(Hr, { style: { borderColor: "#e3e3dd", margin: "20px 0" } }),
                h(Text, { style: { ...texto, fontSize: "13px" } },
                    "A revelação é ", h("strong", null, "ao vivo, no Instagram do Gatil"), ", no dia ",
                    h("strong", null, DATA_SORTEIO_LABEL), ". Boa sorte!"),
                h(Text, { style: { fontSize: "11px", color: "#9a9a92", textAlign: "center", marginTop: "24px" } },
                    "Gatil Irmã Francisca — CNPJ 25.382.038/0001-05")
            )
        )
    );
}

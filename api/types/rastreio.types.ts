// Identificadores de Meta Pixel e GA4 que o navegador envia ao criar a doação.
// Eles vão no metadata da preferência e voltam no webhook, quando o pagamento
// é aprovado — é o que liga a conversão à pessoa que clicou no anúncio.

export interface RastreioDoacao {
  consentimento?: { marketing?: boolean; stats?: boolean };
  fbp?: string;
  fbc?: string;
  gaClientId?: string;
  gaSessionId?: string;
}

/** Dados de rastreio já validados, prontos para o metadata do Mercado Pago. */
export interface RastreioMetadata {
  consentimento_marketing: boolean;
  consentimento_estatisticas: boolean;
  fbp: string | null;
  fbc: string | null;
  ga_client_id: string | null;
  ga_session_id: string | null;
  client_ip: string | null;
  client_user_agent: string | null;
}

// Vem do navegador: tudo que não tiver o formato esperado é descartado.
function aceitar(valor: unknown, formato: RegExp): string | null {
  return typeof valor === "string" && valor.length <= 500 && formato.test(valor) ? valor : null;
}

export function normalizarRastreio(
  rastreio: RastreioDoacao | undefined,
  ip: string | undefined,
  userAgent: string | undefined,
): RastreioMetadata {
  const marketing = rastreio?.consentimento?.marketing === true;
  const stats = rastreio?.consentimento?.stats === true;

  return {
    consentimento_marketing: marketing,
    consentimento_estatisticas: stats,
    fbp: marketing ? aceitar(rastreio?.fbp, /^fb\.\d\.\d+\.\d+$/) : null,
    fbc: marketing ? aceitar(rastreio?.fbc, /^fb\.\d\.\d+\.\S+$/) : null,
    ga_client_id: stats ? aceitar(rastreio?.gaClientId, /^\d+\.\d+$/) : null,
    ga_session_id: stats ? aceitar(rastreio?.gaSessionId, /^\d+$/) : null,
    // IP e navegador só servem para o Meta reconhecer a pessoa.
    client_ip: marketing ? ip ?? null : null,
    client_user_agent: marketing ? userAgent?.slice(0, 500) ?? null : null,
  };
}

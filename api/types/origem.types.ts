/**
 * Tags de UTM aceitas: não são mais fixas no código. Ficam na coleção
 * `utmtags` (mesmo banco deste backend), gerenciada pela seção "UTM" do
 * painel administrativo. Este backend só lê (api/services/utm.service.ts).
 */
export type UtmSource = string;
export type UtmMedium = string;
export type UtmCampaign = string;

export const UTM_CATEGORIAS = ["SOURCE", "MEDIUM", "CAMPAIGN"] as const;
export type UtmCategoria = typeof UTM_CATEGORIAS[number];

/**
 * Campanha que separa a rifa das doações (ehPagamentoRifa e o filtro
 * categoria=DOACAO do painel). Fixa no código; no banco é uma tag "de
 * sistema", que o painel não deixa excluir, desativar nem renomear.
 */
export const CAMPANHA_RIFA = "RIFA_SOLIDARIA";

/**
 * Tags de antes da coleção. Só são usadas como reserva: coleção vazia (antes
 * do `npm run seed:utm` do painel) ou banco fora do ar na leitura das tags.
 */
export const UTM_TAGS_PADRAO: Readonly<Record<UtmCategoria, readonly string[]>> = {
  SOURCE: ["LANDING_PAGE", "INSTAGRAM", "FACEBOOK", "FEIRA_ADOCAO"],
  MEDIUM: ["ORGANICO", "PAGO"],
  CAMPAIGN: ["CAMPANHA_ESPECIFICA", CAMPANHA_RIFA],
};

export interface UtmMetadata {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
}

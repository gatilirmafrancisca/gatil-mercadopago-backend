export const UTM_SOURCE = [
  'LANDING_PAGE', 'INSTAGRAM', 'FACEBOOK', 'FEIRA_ADOCAO'
] as const;
export type UtmSource = typeof UTM_SOURCE[number];

export const UTM_MEDIUM = [
  'ORGANICO', 'PAGO'
] as const;

export type UtmMedium = typeof UTM_MEDIUM[number];

export const UTM_CAMPAIGN = [
  'CAMPANHA_ESPECIFICA', 'RIFA_SOLIDARIA'
] as const;
export type UtmCampaign = typeof UTM_CAMPAIGN[number];

export interface UtmMetadata {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
}
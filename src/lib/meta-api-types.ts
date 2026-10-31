export interface MetaActionValue { action_type?: string; value?: string | number }
/** Entity and insight fields requested by the reporting endpoints. */
export interface MetaReportingRow extends Record<string, unknown> {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
  adset_id: string;
  ad_id: string;
  campaign_name?: string;
  adset_name?: string;
  ad_name?: string;
  date_start?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  actions?: MetaActionValue[];
  cost_per_action_type?: MetaActionValue[];
  purchase_roas?: MetaActionValue[] | string | number;
  website_purchase_roas?: MetaActionValue[] | string | number;
}
export interface MetaReportingResponse extends Partial<MetaReportingRow> {
  data?: MetaReportingRow[];
  paging?: { next?: string };
  error?: { message?: string };
}

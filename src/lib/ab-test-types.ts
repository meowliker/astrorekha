export interface AbTestConfig extends Record<string, unknown> {
  id?: string; name?: string; status?: string; created_at?: string; updated_at?: string;
  traffic_split?: number;
  variants?: Record<string, { weight: number; page?: string }>;
}
export interface AbTestStats {
  impressions?: number; conversions?: number; bounces?: number; checkouts_started?: number; total_revenue?: number;
}
export interface AbEventMetadata extends Record<string, unknown> {
  metadata?: AbEventMetadata; event_data?: AbEventMetadata; data?: AbEventMetadata;
}
export interface AbDailyStats { impressions: number; conversions: number; bounces: number; revenue: number }

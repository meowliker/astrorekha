import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { partnerFunnels, type PartnerFunnel } from "./partner-funnels";

const liveChannels = { google: "Google Ads", meta: "Meta Ads", other: "Other or untagged" } as const;
type Counts = { today: number; recent: number };
type Channel = Counts & { label: string };

export type PartnerFunnelTraffic = {
  key: PartnerFunnel;
  total: Counts;
  channels: Channel[];
};

export type PartnerLiveTraffic = {
  date: string;
  timeZone: string;
  checkedAt: string;
  funnels: PartnerFunnelTraffic[];
};

export async function readPartnerLiveTraffic(
  timeZone: string, date: string, checkedAt: string, includeChannels: boolean,
): Promise<PartnerLiveTraffic> {
  const { data, error } = await getSupabaseAdmin({ fresh: true })
    .rpc("read_partner_funnel_live_traffic", { p_time_zone: timeZone, p_checked_at: checkedAt })
    .abortSignal(AbortSignal.timeout(6000));
  if (error || !Array.isArray(data)) throw new Error("Live traffic unavailable");

  const funnels = partnerFunnels.map(({ key }) => {
    const total = { today: 0, recent: 0 };
    const channels = Object.entries(liveChannels).map(([channel, label]) => {
      const row = data.find(item => item.funnel === key && item.channel === channel);
      const today = Number(row?.today_views ?? 0);
      const recent = Number(row?.recent_views ?? 0);
      total.today += today;
      total.recent += recent;
      return { label, today, recent };
    });
    return { key, total, channels: includeChannels ? channels : [] };
  });

  return { date, timeZone, checkedAt, funnels };
}

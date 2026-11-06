import { getSupabaseAdmin } from "@/lib/supabase-admin";

const liveChannels = { google: "Google Ads", meta: "Meta Ads", other: "Other or untagged" } as const;
type Counts = { today: number; recent: number };

export type PartnerLiveTraffic = {
  date: string;
  timeZone: string;
  checkedAt: string;
  total: Counts;
  channels: (Counts & { label: string })[];
};

export async function readPartnerLiveTraffic(
  timeZone: string, date: string, checkedAt: string, includeChannels: boolean,
): Promise<PartnerLiveTraffic> {
  const { data, error } = await getSupabaseAdmin({ fresh: true }).rpc("read_partner_live_traffic", { p_time_zone: timeZone, p_checked_at: checkedAt })
    .abortSignal(AbortSignal.timeout(6000));
  if (error || !Array.isArray(data)) throw new Error("Live traffic unavailable");

  const total = { today: 0, recent: 0 };
  const counts = Object.entries(liveChannels).map(([key, label]) => {
    const row = data.find(item => item.channel === key);
    const today = Number(row?.today_views ?? 0);
    const recent = Number(row?.recent_views ?? 0);
    total.today += today;
    total.recent += recent;
    return { label, today, recent };
  });
  return { date, timeZone, checkedAt, total, channels: includeChannels ? counts : [] };
}

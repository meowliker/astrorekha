import type { SupabaseClient } from "@supabase/supabase-js";

const pauseSetting = "monitoring_alert_delivery";

export type MonitoringDestination = {
  kind: "email" | "slack" | "slack_chat";
  label: string;
  address: string;
  enabled: boolean;
};

export async function readMonitoringAlertsPaused(db: SupabaseClient): Promise<boolean> {
  const { data, error } = await db.from("settings").select("value").eq("key", pauseSetting)
    .abortSignal(AbortSignal.timeout(5000)).maybeSingle();
  if (error || (data && typeof data.value?.paused !== "boolean")) {
    throw new Error("Unable to read the alert pause setting.");
  }
  return data?.value.paused ?? false;
}

export async function setMonitoringAlertsPaused(db: SupabaseClient, paused: boolean) {
  const { error } = await db.from("settings").upsert({
    key: pauseSetting, value: { paused }, updated_at: new Date().toISOString(),
  }, { onConflict: "key" });
  if (error) throw new Error("Unable to update the alert pause setting.");
}

export async function monitoringAlertRecipients(
  db: SupabaseClient, environment: MonitoringDestination[], environmentOnly: boolean,
): Promise<MonitoringDestination[]> {
  const { data } = await db.from("monitoring_destinations").select("kind,label,address,enabled")
    .abortSignal(AbortSignal.timeout(5000));
  const paused = await readMonitoringAlertsPaused(db).catch(() => {
    console.warn("Monitoring alert delivery skipped because the pause setting could not be read.");
    return true;
  });
  if (paused) return [];

  const saved = (data ?? []) as MonitoringDestination[];
  const key = (item: MonitoringDestination) => `${item.kind}:${item.kind === "email" ? item.address.toLowerCase() : item.address}`;
  const disabled = new Set(saved.filter(item => !item.enabled).map(key));
  const destinations = environmentOnly ? environment : [...environment, ...saved];
  return [...new Map(destinations.filter(item => item.enabled && !disabled.has(key(item)))
    .map(item => [key(item), item])).values()];
}

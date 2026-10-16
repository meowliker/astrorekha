import type { MonitorCheck } from "./system-monitoring";

type PreviousRun = { started_at: string; checks: MonitorCheck[] } | null;

export function confirmBrevoFailure(check: MonitorCheck, previous: PreviousRun, trigger: "cron" | "manual", now: number): MonitorCheck {
  if (check.key !== "brevo" || (check.status !== "warning" && check.status !== "down")) return check;
  const priorCheck = previous?.checks?.find((item) => item.key === "brevo");
  const priorFailed = priorCheck && (priorCheck.observedStatus === "warning" || priorCheck.observedStatus === "down"
    || priorCheck.status === "warning" || priorCheck.status === "down");
  const elapsed = previous ? now - Date.parse(previous.started_at) : Infinity;
  if (trigger === "cron" && priorFailed && elapsed >= 0 && elapsed <= 70 * 60_000) {
    return { ...check, observedStatus: check.status };
  }
  return {
    ...check, observedStatus: check.status, status: "warming",
    message: `Brevo check inconclusive: ${check.message}. Waiting for the next scheduled check.`,
  };
}

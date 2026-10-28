import type { MonitorCheck } from "./system-monitoring";

export type MonitorAlertChange = { check: MonitorCheck; event: "issue" | "recovery" };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&#39;" })[char] || char);
}

function issueExplanation(check: MonitorCheck): string {
  const { key, message } = check;
  if (key === "supabase") return "We couldn't read or save information in Supabase. Orders and other live data may be affected. Check Supabase and the AstroRekha site.";
  if (key === "supabase_auth") return "We couldn't check the login service. Customers may have trouble signing in. Check Supabase Auth.";
  if (key === "supabase_storage") return "We couldn't check file storage. Uploads or saved files may be affected. Check Supabase Storage.";
  if (key === "monitoring_storage") return "The monitor couldn't save its latest results. The status page may be out of date. Check the Supabase connection.";
  if (key === "vercel") return "The AstroRekha website didn't pass its availability check. Open the site and check its Vercel deployment.";
  if (key === "sales") return message.startsWith("No paid sales")
    ? "No paid sale was recorded in the last hour. Check the checkout flow and incoming traffic."
    : "We couldn't check recent paid sales. Check the payments data in Supabase.";
  if (key.startsWith("meta:")) return message.startsWith("No new Meta Insights spend")
    ? `${message}. Meta can report spend late; check Ads Manager before assuming ads have stopped.`
    : "We couldn't get a reliable update from this ad account. Check its status in Meta Ads Manager.";
  if (key === "meta") return "We couldn't check the connected ad accounts. Check the Meta account connection.";
  if (key === "payment_reconciliation") return message.includes("remain created/pending")
    ? "Some payments succeeded in PayU but still show as pending in AstroRekha. Customers may be missing access. Check payment reconciliation."
    : "We couldn't check whether all successful payments were completed in AstroRekha. Check PayU and payment reconciliation.";
  if (key === "paytm") return "The Paytm backup could not be verified on two scheduled checks. Check Paytm before switching new payments to it.";
  if (key === "payu") return "We couldn't confirm a recent payment with PayU. Check PayU and the payment status page.";
  if (key === "brevo") return "The Brevo email API failed two checks in a row. Check Brevo and recent email deliveries.";
  if (key === "brevo_send") return "Brevo did not accept a transactional email request. Check recent customer emails and the Brevo dashboard.";
  if (key === "aisensy") return "The AiSensy endpoint did not respond on two scheduled checks. Check AiSensy and recent WhatsApp deliveries.";
  if (key === "claude") return "We couldn't confirm Claude is working. AI responses may be delayed. Check the Anthropic service status.";
  if (key === "kie") return message.includes("credits are exhausted")
    ? "Kie.ai has run out of credits. Image generation may stop until credits are added."
    : "We couldn't confirm Kie.ai is working. Image generation may be delayed. Check Kie.ai.";
  if (key === "prokerala") return "We couldn't confirm Prokerala is working. Astrology reports may be delayed. Check its connection.";
  if (key === "openai") return "We couldn't confirm OpenAI is working. Features that use it may be delayed. Check its service status.";
  if (key === "google_sheets") return "We couldn't read the connected Google Sheets. Sheet-based updates may be delayed. Check the Sheets connection.";
  if (key === "astro_engine") return "The astrology engine didn't pass its check. Chart and report generation may be delayed. Check the engine service.";
  if (key === "slack") return "We couldn't confirm the Slack bot is working. Check its connection. Incoming webhook alerts may still work.";
  if (message.toLowerCase().includes("rate limit")) return "This service is temporarily limiting requests. Some updates may be delayed. Check its status and try again later.";
  return "We couldn't confirm this service is working. Check its connection and the System Status page for details.";
}

function recoveryExplanation(check: MonitorCheck): string {
  if (check.key === "brevo_send") return "No new Brevo email submission failures were recorded in the last hour. Check Brevo for final delivery status.";
  if (check.key === "aisensy") return "The AiSensy endpoint is responding again. This check does not confirm WhatsApp message delivery.";
  if (check.key === "sales") return "Paid sales have been recorded again.";
  if (check.key.startsWith("meta:")) return "This ad account is reporting spend again.";
  return "Its health check is passing again.";
}

export function buildMonitoringAlert(changed: MonitorAlertChange[], checkedAt = new Date()) {
  const issueCount = changed.filter(({ event }) => event === "issue").length;
  const subject = issueCount
    ? `AstroRekha alert: ${issueCount} ${issueCount === 1 ? "issue needs" : "issues need"} attention`
    : "AstroRekha update: service checks recovered";
  const heading = issueCount ? "AstroRekha needs attention" : "AstroRekha services are recovering";
  const entries = changed.map(({ check, event }) => ({
    name: check.name,
    label: event === "issue" ? "Needs attention" : "Working again",
    explanation: event === "issue" ? issueExplanation(check) : recoveryExplanation(check),
  }));
  const time = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata",
  }).format(checkedAt);
  const statusUrl = "https://astrorekha.com/admin/monitoring";
  const slackText = `${issueCount ? "<!here> " : ""}*${heading}*\n\n${entries.map((entry) =>
    `*${entry.name} — ${entry.label}*\n${entry.explanation}`).join("\n\n")}\n\nChecked ${time} IST · View details: ${statusUrl}`;
  const emailHtml = `<h2>${escapeHtml(heading)}</h2>${entries.map((entry) =>
    `<p><strong>${escapeHtml(entry.name)} — ${entry.label}</strong><br>${escapeHtml(entry.explanation)}</p>`).join("")}`
    + `<p>Checked ${escapeHtml(time)} IST · <a href="${statusUrl}">View details in System Status</a></p>`;
  return { subject, slackText, emailHtml };
}

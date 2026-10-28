import { google } from "googleapis";

export function usGAReportingConfig(env: NodeJS.ProcessEnv = process.env) {
  const usMeasurement = env.NEXT_PUBLIC_US_SOULMATE_GA_ID;
  const sharedMeasurement = env.NEXT_PUBLIC_GA_ID || env.GA4_MEASUREMENT_ID;
  // A shared property is safe only when the deployed measurement IDs match.
  const sharedStream = Boolean(usMeasurement && usMeasurement === sharedMeasurement);
  const property = env.US_SOULMATE_GA4_PROPERTY_ID || env.US_SOULMATE_GOOGLE_ANALYTICS_PROPERTY_ID || (sharedStream ? env.GA4_PROPERTY_ID || env.GOOGLE_ANALYTICS_PROPERTY_ID : undefined);
  const dedicatedCredentials = env.US_SOULMATE_GOOGLE_SERVICE_ACCOUNT_EMAIL && env.US_SOULMATE_GOOGLE_PRIVATE_KEY;
  const email = dedicatedCredentials ? env.US_SOULMATE_GOOGLE_SERVICE_ACCOUNT_EMAIL : env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (dedicatedCredentials ? env.US_SOULMATE_GOOGLE_PRIVATE_KEY : env.GOOGLE_PRIVATE_KEY)?.replace(/\\n/g, "\n");
  return { property, email, key };
}
export async function usGABounceRate(startDate: string, endDate: string) {
  const { property, email, key } = usGAReportingConfig();
  const scope = "full_days" as const;
  if (!property || !email || !key) return { value: null, sessions: null, scope, status: "GA4 reporting is not configured for the US stream. A matching property ID and service-account read access are required." };
  try {
    const auth = new google.auth.GoogleAuth({ credentials: { client_email: email, private_key: key }, scopes: ["https://www.googleapis.com/auth/analytics.readonly"] });
    const api = google.analyticsdata({ version: "v1beta", auth });
    const { data } = await api.properties.runReport({ property: `properties/${property}`, requestBody: {
      dateRanges: [{ startDate, endDate }], metrics: [{ name: "bounceRate" }, { name: "sessions" }],
      dimensionFilter: { andGroup: { expressions: [
        { filter: { fieldName: "landingPage", inListFilter: { values: ["/us/soulmate", "/us/soulmate/"] } } },
        { notExpression: { filter: { fieldName: "sessionSource", stringFilter: { matchType: "EXACT", value: "codex_qa" } } } },
      ] } },
    } }, { timeout: 8000 });
    const values = data.rows?.[0]?.metricValues;
    const sessions = Number(values?.[1]?.value || 0);
    const timezone = data.metadata?.timeZone || "property timezone";
    return { value: sessions > 0 ? Number(values?.[0]?.value) * 100 : null, sessions, scope,
      status: `GA4 bounce rate: ${sessions} processed sessions, full calendar days in ${timezone}. It does not use the 11:30 AM IST cutoff. Tagged QA is excluded; GA4 processing can delay this figure.` };
  } catch { return { value: null, sessions: null, scope, status: "GA4 report unavailable. Check property read access. Live funnel and sales data below are still available." }; }
}

# System monitoring

The `/admin/monitoring` page shows the latest service checks, prior runs, open issues, alert delivery history, and alert destinations. Admin sessions protect both the page's API and destination management. Slack webhook URLs are stored in a service-role-only Supabase table and are masked in API responses.

## Deploy

1. Apply `supabase/migrations/20261013120000_create_system_monitoring.sql` to the production Supabase project before deploying this code.
2. Ensure `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and the existing provider credentials are set in Vercel. Set `MONITOR_PUBLIC_URL=https://astrorekha.com` if the site's public URL is different from `NEXT_PUBLIC_APP_URL`.
3. Deploy `vercel.json`. Vercel calls `/api/cron/monitor-system` at `:00` and `:30` UTC with `Authorization: Bearer <CRON_SECRET>`.
4. Open `/admin/monitoring`, add alert destinations, and use **Run checks now**. The first Meta check establishes a spend baseline; the next scheduled run can detect a flat spend counter.
5. In Vercel, verify that the cron is listed and that the account plan supports a 30 minute schedule. Verify subsequent runs and alert delivery in the admin page.

## Email and Slack

Email uses the existing Brevo transactional sender (`BREVO_API_KEY`, `BREVO_SENDER_EMAIL`) to send to any Gmail or other email address added on the page. A Gmail API connection is not needed to receive alerts.

For a Slack channel, create an app in your workspace, turn on **Incoming Webhooks**, choose **Add New Webhook to Workspace**, and select the channel. Paste the resulting `https://hooks.slack.com/services/...` URL into the page. Create a separate webhook for each channel. Keep webhook URLs private.

For arbitrary channels or a person's DM, grant the Slack app `chat:write`, install it to the workspace, and store its bot token as `SLACK_BOT_TOKEN` in Vercel. In the page choose **Slack channel or person ID** and enter a channel ID (`C…`), group ID (`G…`), DM ID (`D…`), or user ID (`U…`). The bot needs permission to post in the target conversation. This option reports delivery failures in the alert log.

When Supabase is down, the saved destination table cannot be read. Configure `MONITOR_ALERT_EMAILS` (comma-separated email addresses) and/or `MONITOR_SLACK_WEBHOOK_URLS` (comma-separated incoming webhook URLs) as Vercel environment variables for a fallback path. These environment destinations are merged with the UI destinations without duplicate delivery. A Slack fallback can still alert when Brevo itself is unavailable.

## Coverage and limitations

The monitor checks the public app health endpoint, Supabase database/Auth/Storage, confirmed paid sales in the last hour, each configured Meta ad account's spend counter, read-only PayU verification of a recent paid transaction, and a sample of unresolved payments to detect PayU-confirmed orders still marked created/pending. It also checks Claude, Kie credit API, Prokerala token endpoint, Brevo, OpenAI, Google Sheets, and the configured astro engine. Free Astrology API, AstrologyAPI, and AiSensy checks confirm host reachability only. GA4 purchase events, Divine API, and Razorpay are listed with configuration-only status because a read-only check cannot prove a paid or write workflow works.

Meta no-spend alerts compare successive account spend counters on roughly 30 minute windows (at least 29 minutes apart to allow scheduler drift). They cannot establish whether a specific campaign should have delivered, and may warn during intentionally paused delivery. The first run and a reset spend counter start a new comparison window.

Alerts are sent when a check enters a warning/down state or recovers; ongoing issues do not alert on every cron run. Manual runs also update the log. No-sale alerts apply at all hours.

This monitor runs on Vercel. A full Vercel outage or a stopped cron cannot report itself. Add an independent external uptime/heartbeat service for that failure mode. Cron delivery is not guaranteed and does not retry automatically; check recent-run timestamps in the page after deployment.

# System monitoring

The `/admin/monitoring` page shows the latest service checks, prior runs, open issues, alert delivery history, and alert destinations. Admin sessions protect both the page's API and destination management. Slack webhook URLs are stored in a service-role-only Supabase table and are masked in API responses.

Email and Slack alerts explain the impact in plain language and link to this page for diagnostic details. New Slack issues include `@here`; recovery messages do not ping the channel. Slack's `@here` reaches active channel members according to their notification settings.

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

**Pause all alerts** in System Status pauses Slack and email delivery, including Vercel fallback recipients. Health checks and incident logging continue. Resume delivery with **Resume all alerts**.

Vercel can supply fallback recipients through `MONITOR_ALERT_EMAILS` and `MONITOR_SLACK_WEBHOOK_URLS`. Turning off a dashboard destination also suppresses a matching fallback address. The monitor checks the saved pause setting before sending through either path. If it cannot read the setting, including during a full Supabase outage, it skips delivery.

## Coverage and limitations

The monitor checks the public app health endpoint, Supabase database/Auth/Storage, confirmed paid sales in the last hour, each configured Meta ad account's spend counter, read-only PayU verification of a recent paid transaction, and a sample of unresolved payments to detect PayU-confirmed orders still marked created/pending. It also checks Claude, Kie credit API, Prokerala token endpoint, Brevo, OpenAI, Google Sheets, and the configured astro engine. Free Astrology API, AstrologyAPI, and AiSensy checks confirm host reachability only. GA4 purchase events, Divine API, and Razorpay are listed with configuration-only status because a read-only check cannot prove a paid or write workflow works.

Meta no-spend alerts compare successive account spend counters on roughly 30 minute windows (at least 29 minutes apart to allow scheduler drift). They cannot establish whether a specific campaign should have delivered, and may warn during intentionally paused delivery. The first run and a reset spend counter start a new comparison window.

Alerts are sent when a check enters a warning/down state or recovers; ongoing issues do not alert on every cron run. Manual runs also update the log. No-sale alerts apply at all hours.

This monitor runs on Vercel. A full Vercel outage or a stopped cron cannot report itself. Add an independent external uptime/heartbeat service for that failure mode. Cron delivery is not guaranteed and does not retry automatically; check recent-run timestamps in the page after deployment.

## Ad account balance alerts

- Daily cron `/api/cron/ad-balance-summary` runs at `30 12 * * *` UTC (6 PM IST), with scheduler drift allowed until 6:59 PM IST. It sends one Slack message, tagging Nischay (`U08C5ENV66Q`), with bold **AstroRekha** and **VedicRekha** sections.
- AstroRekha uses the deduplicated account lists across the normal, Soulmate, US Soulmate and US AstroRekha workspaces. An account active in any workspace is checked. Inactive or out-of-window accounts are omitted from the daily message and do not generate low-balance incidents. They remain in internal check history so old incidents can be closed. Active accounts with unavailable balance data remain visible as unavailable.
- VedicRekha includes `2022187855078303` and `2366717340763776`, using the saved token for `1123080110423751`. They are balance-only additions: they do not enter app spend/revenue reporting or no-spend checks.
- Remaining balance means **account spending limit minus account amount spent**, divided by 100 for INR/USD. This is *not* a prepaid wallet balance. Meta's outstanding `balance` field is deliberately not used. A missing/zero/unlimited cap or failed API request is unavailable, never zero. USD is converted using a fresh exchange-rate response; no guessed fallback rate is used.
- The existing half-hour monitor adds a separate balance incident per account when the INR equivalent is strictly below ₹5,000. Alerts include the actual account name/ID and amount, tag Nischay, and go to existing enabled Slack/email destinations. They alert on entry into a low state, do not repeat every run, and recover when the amount reaches ₹5,000. Unavailable data leaves an existing incident open without reporting a false recovery.
- Daily summaries and threshold alerts both obey global pause and disabled destinations. Daily summaries are Slack-only. Service alerts retain their existing behavior.
- Apply `20261113190000_monitoring_ad_balance_digest.sql` before deployment. It adds a service-role-only daily claim/history table and permits `summary` in notification history. No new env secrets are required.
- A unique daily claim suppresses overlapping requests/replays. The job does not automatically resend after a delivery timeout (Slack might already have accepted it); failed/undelivered summaries stay recorded for review. Delivery history is in System Status. Like other Vercel crons, scheduling is not an exact-time delivery guarantee.
- Rollback: revert this release and remove the daily cron entry. The additive history table can remain; other service checks, payments, and ad reporting are unchanged.

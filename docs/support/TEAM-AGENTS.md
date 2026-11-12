# AstroRekha support workspace

Before investigating any customer or checking Gmail, read `docs/support/SKILL.md` and `docs/support/README.md`. Run `node scripts/support/client.mjs start` from this folder and read the full current instructions, settings and safeguards it returns. The owner publishes rules in the dashboard; do not assume a previous chat or local policy copy is current.

Refresh before each next customer and immediately before Gmail draft, label or read-state changes. If the live rules cannot be fetched, stop dependent work and report the blocker. Follow the latest version and the server's fixed permissions. Never send automatically.

The client loads the individual support token from `.env.support` automatically. Never display that file, its token, or `.support-rules-session.json`. Never request or use production database/environment credentials. Use only the connected team.astrorekha@gmail.com account and the restricted support API.

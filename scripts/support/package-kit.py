"""Build the public support kit from an explicit non-secret file allowlist."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED, ZipInfo

root = Path(__file__).resolve().parents[2]
output = root / "public/downloads/astrorekha-support-kit.zip"
files = {name: (root / name).read_text() for name in ["docs/support/README.md", "docs/support/SKILL.md", "scripts/support/client.mjs"]}
files["AGENTS.md"] = (root / "docs/support/TEAM-AGENTS.md").read_text()
files[".env.support.example"] = "ASTROREKHA_SUPPORT_TOKEN=\n"
files[".gitignore"] = ".env.support\n.support-rules-session.json*\n"
files["START-HERE.txt"] = """AstroRekha Support Kit — live rules edition

Existing operators: replace AGENTS.md, docs/ and scripts/ in your existing Support Kit folder. Keep your existing .env.support unchanged. Your current token still works. Never replace .env.support with the empty example file.

New operators: accept your individual dashboard invitation, set your password and create a personal token under Team & Codex. Copy .env.support.example to .env.support and paste the token after the equals sign. Keep that file local.

Open this folder in Codex. Connect only team.astrorekha@gmail.com. Ask Codex to read AGENTS.md and docs/support/SKILL.md, then run:
node scripts/support/client.mjs GET me
node scripts/support/client.mjs start

The second command fetches the latest published rules. Read them at every Gmail run, between customers and before changing Gmail. Old/expired rules block customer API operations. Never proceed from an offline rules copy when refresh fails.

Owners update the dashboard's Support Rules, include a change note, then publish. Teammates do not need new files for later policy edits. Feature/client changes may require a separate kit update.

Requires Node.js 20 or newer. No repository or Supabase access is needed. This kit contains no credentials or customer data. Drafts remain unsent until a human reviews and sends them.
"""
output.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(output, "w", ZIP_DEFLATED) as archive:
    for name, content in sorted(files.items()):
        entry = ZipInfo("AstroRekha-Support-Kit/" + name, date_time=(2026, 11, 12, 0, 0, 0))
        entry.compress_type = ZIP_DEFLATED
        entry.external_attr = 0o100644 << 16
        archive.writestr(entry, content)
print(output)

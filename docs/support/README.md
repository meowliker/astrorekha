# AstroRekha support workspace

The `/support` workspace provides individual staff access to customer investigation and controlled recovery. Staff do not need database credentials, payment secrets, generation API keys, or repository write access. The same operations are exposed through `/api/support` for Codex.

## Owner setup

1. Apply `supabase/migrations/20261112170000_support_workspace.sql` to the website database, then deploy this version of the website. The migration adds support tables and service-only RPCs; it does not modify existing customer records during installation.
2. Open `/support` and select **First-time owner setup**. Authenticate with an existing AstroRekha admin account, then choose your personal support email and a new password of at least 12 characters. Setup is permitted only once, checked under a database lock.
3. Open **Team & Codex**, create invitations, and share each invitation directly with its intended teammate. Invitations expire in 24 hours. Staff set their own password. Support sessions expire after eight hours.
4. Teammates can create a personal 30-day API token for Codex. Keep it in their local secret environment or password manager. Never share the production `.env` file. Revoking staff access invalidates their sessions and tokens.
5. Give staff `docs/support/SKILL.md` and `scripts/support/client.mjs`. Connect only `team.astrorekha@gmail.com` in Codex. Gmail authorization is separate from support API authorization.

No owner is seeded with a default password. API tokens cannot manage team access or approve sensitive actions, even if issued to an owner. Owner decisions require a same-origin browser session.

## Workflow

Find the customer by exact email, phone number in payment records, user ID, internal payment ID, PayU ID, or gateway transaction reference. Read the full email conversation, including previous replies. Create a support case with the Gmail thread ID, customer ID and evidence. Search by other references if the first search finds nothing; a missing account match does not establish that the customer did not pay.

The customer view shows saved birth details, payment snapshots and linked IDs, paid access, report state, available inputs, login method, latest OTP-request timestamps, and recovery history. OTP creation is **not proof of email delivery**. Codes, password hashes, image bytes and provider credentials are never returned by the support API.

Available repairs:

- Verify existing PayU, Pine Labs or Paytm orders against their gateway, then atomically restore paid access. Credits are granted once for a newly confirmed payment. Already-paid legacy orders without a fulfillment marker require review of any missing coins; consumed coins are never silently replenished.
- Restore entitlements from an existing fulfilled purchase without adding credits again.
- Request mapping for an existing, unfulfilled, unassigned legacy payment whose email exactly matches the customer. This requires gateway verification and owner approval. Already-owned payments, immutable backup-gateway orders, absent orders, Google Play receipts and uncertain identities require developer investigation; the tool does not guess or manufacture a payment.
- Correct verified birth details, recalculate Vedic signs, update both profile and account, refresh natal context, and invalidate older dependent reports. Recover the purchased reports afterward.
- Recover paid Palm Reading, Birth Chart, Future Partner, Past Life, Astrocartography and Soulmate Sketch reports. Saved quiz answers can recover incomplete Aura Color, Spirit Animal and Witch Archetype results. Shared predictions and computed numerology/compatibility do not have per-user generation jobs; restore their purchased feature access if needed.
- Check profiles, payment snapshots, exact-email/payment-linked alternate profiles, report tables and palm storage before requesting new information. Conflicting data is blocked for review. A recovered alternate birth snapshot must be explicitly applied as a correction before report generation.
- Regenerate a saved sketch when appropriate, resuming an existing provider job before submitting another. A provider timeout leaves the action needing review; it never produces a ready reply.
- Request email corrections, compensation questions (3 coins each), or additional access grants. Each needs explicit owner approval. An API token cannot approve its own request.
- Reset the Aura Color quiz with the previous result retained in the action audit. Never offer palm replacement.

Repairs have per-account concurrency guards and request UUIDs. Retrying the same UUID returns the existing action. A database transaction commits short repairs and their audit together. Never automatically retry an interrupted report job. Inspect its saved result and provider job first; owners can release an interrupted action after ten minutes. Releasing it does not restart it.

## Gmail and reply handling

The dashboard prepares and stores a reply **in the support case**. It does not connect directly to Gmail and cannot send mail. Connected Codex reads threads and saves Gmail drafts using the existing Gmail connector, following `SKILL.md`. Staff can also copy the verified reply into Gmail themselves.

Only completed saved results for unlocked features may be selected for a ready reply. Review the exact report names and issue before saving. Existing drafts must not be overwritten when a teammate intentionally edits or removes them. Drafts contain no quoted history, attachments or PDFs. Gmail sending is a separate human action.

The initial implementation is for the **website database**. Android accounts, cross-platform migrations, refunds, chargeback decisions, unidentified receipts, corrupted source data and underlying application bugs are escalation cases. There is no arbitrary SQL or arbitrary HTTP proxy endpoint.

## API

All endpoints require an individual `Authorization: Bearer ar_support_…` token, except browser login, invite activation and owner bootstrap. Tokens never authorize existing `/api/admin` endpoints. Browser writes require a matching Origin and use an HttpOnly, Secure, SameSite=Strict cookie. Responses are no-store. Support pages disable marketing/analytics and search indexing.

- `GET me`
- `GET search?q=<URL-encoded exact identifier>`
- `GET customers/<userId>`
- `GET cases` and `GET actions` (100 per page; follow `nextOffset` with `?offset=N`; optional `?status=...` filter). Cases also support `?threadId=...`. Re-importing a thread returns its existing case without overwriting staff edits. Customer detail includes the latest 50 actions.
- `POST cases`: `{customerId, threadId, subject, issue, mailbox:"team.astrorekha@gmail.com"}`
- `POST actions`: `{requestKey:<UUID>, customerId, caseId?, kind, reason, payload}`
- `POST cases/<id>`: `{generateDraft:true, reportKeys:["birthChart"]}` or `{draft:<text>, reportKeys:[...]}`
- `POST cases/<id>`: `{status:"open"|"needs_input"|"ready_for_review"|"resolved", reviewConfirmed:true}`. `resolved` is a manual support assertion after review.

Action payloads:

| kind | payload | Owner decision |
| --- | --- | --- |
| `reconcile_payment` | `{paymentId}` | No; gateway must verify |
| `restore_access` | `{paymentId}` | No; fulfilled purchase must match |
| `recover_report` | `{report:"palmReading", force:false}` | No; access and data required |
| `correct_birth` | `{date:"2003-06-28",time:"12:30",place:"Raipur, Chhattisgarh, India"}` | No; record customer evidence |
| `change_email` | `{email}` | Yes |
| `add_questions` | `{questions:10}` | Yes |
| `grant_features` | `{features:["soulmateSketch"]}` | Yes |
| `link_payment` | `{paymentId}` | Yes |
| `reset_quiz` | `{report:"auraColorReport"}` | No; record customer's request |

Run `node scripts/support/client.mjs GET 'search?q=customer%40example.com'`. For writes, put JSON in a local file and pass the filename: `node scripts/support/client.mjs POST actions /path/to/request.json`. Never put credentials in prompts or command arguments.

## Validation and rollout

`node scripts/support/check-boundaries.cjs` tests actual API handlers with a mock database. `scripts/support/transaction-tests.sql` is a rollback-only test for the dedicated test account. Prepend the migration with its final COMMIT removed; the test rolls back the complete transaction. Do not run it against a database where this migration is already installed without adapting the setup. No customer emails are sent by these checks.

Install this additive migration before routing traffic to the new page. Existing purchase and login flows are retained. The Palm Reading route respects invalidated results and checks the saved sign before reusing a reading; known noon and midnight birth times remain valid. Rollback is reverting the code deployment; retain support history. Do not drop audit tables or undo successful customer repairs as part of a code rollback.

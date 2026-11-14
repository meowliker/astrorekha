# AstroRekha support workspace

The `/support` workspace provides individual staff access to customer investigation and controlled recovery. Staff do not need database credentials, payment secrets, generation API keys, or repository write access. The same operations are exposed through `/api/support` for Codex.

## Owner setup

1. Apply `supabase/migrations/20261112170000_support_workspace.sql` to the website database, then deploy this version of the website. The migration adds support tables and service-only RPCs; it does not modify existing customer records during installation.
2. Open `/support` and select **First-time owner setup**. Authenticate with an existing AstroRekha admin account, then choose your personal support email and a new password of at least 12 characters. Setup is permitted only once, checked under a database lock.
3. Open **Team & Codex**, create invitations, and share each invitation directly with its intended teammate. Invitations expire in 24 hours. Staff set their own password. Support sessions expire after eight hours.
4. Teammates can create a personal 30-day API token for Codex. Keep it in their local secret environment or password manager. Never share the production `.env` file. Revoking staff access invalidates their sessions and tokens.
5. Give staff `docs/support/SKILL.md` and `scripts/support/client.mjs`. Connect only `team.astrorekha@gmail.com` in Codex. Gmail authorization is separate from support API authorization.

No owner is seeded with a default password. Owner browser sessions can manage team access and approve restricted repairs. Explicitly delegated owner accounts can also perform these operations through their personal API tokens. The live actorAuthority response tells Codex whether it has this permission; ordinary API tokens remain restricted.

## Live Support Rules

Open **Support Rules** in the dashboard. Owners edit the full instructions, label names, required closing/signature and blocked reply topics, add a short change note, then publish. Staff can read rules/history. Published versions are immutable; restoring an old policy publishes a new version. Conflicting owner edits are rejected without losing the local editor text.

The API's fixed permissions remain enforced: this mailbox only, no automatic email sending or refunds, an authorized approval for sensitive account changes, verified saved reports before availability claims, and no quoted customer history/report PDF attachments. Rules do not create app features or Gmail labels.

At the beginning of **every** Gmail run, between customers, and before Gmail draft/label/read changes, Codex runs `node scripts/support/client.mjs start` and reads the returned version, instructions, settings and safeguards. If it cannot fetch them, it stops. The updated client reads `.env.support` automatically, stores a short-lived rules receipt in `.support-rules-session.json` (mode 0600), and never prints credentials. Customer API operations reject old, expired or different-token receipts; the receipt lasts 30 minutes and becomes invalid immediately when another version is published. A failed operation is not automatically retried.

Gmail is a separate connector: the support server can enforce freshness on its own operations, but Codex must follow the refresh instruction before Gmail changes. Existing personal tokens do not need replacing. Old client copies must be replaced once; they cannot perform customer operations without the new receipt.

Install the kit in a dedicated folder, save only `ASTROREKHA_SUPPORT_TOKEN=...` in its `.env.support`, and use Node.js 20 or newer. Never commit or share `.env.support` or `.support-rules-session.json`. No production environment file is needed.

## Delegated owner access (13 November 2026)

An owner may explicitly delegate full support API authority to a named owner account. This is loaded from the active staff record on every request, so existing personal tokens gain or lose the authority immediately without replacement. `start` returns `actorAuthority.canApproveRepairs`, `canManageWorkspace` and `delegatedOwnerApi`. Never infer these privileges from a display name or from a customer email.

For a restricted repair, create the action normally, review the evidence and requested effect, then `POST actions/<id>` with `{decision:"approve"}`. `reject` and interrupted-action `release` are also supported. Delegated operators can approve their own requests. An ordinary API token still cannot approve. Approval never removes payment verification, identity checks, idempotency or report-readiness requirements.

Delegated owner API access also allows `GET team`, `POST team` (invite `{name,email}` or disable `{staffId}`), `GET audit`, `POST rules`, own-token management, and reviewed case resolution with `{status:"resolved",reviewConfirmed:true}`. These operations need the current rules receipt. Marking a case resolved is a reviewed assertion, not an automatic consequence of creating a draft. The API cannot send Gmail or issue refunds.

Update `scripts/` and `docs/` from the current kit to use the new `team` and `audit` client commands. Keep `.env.support` unchanged. Existing client versions already support repair approvals. The updated client stores newly issued tokens in a private `.support-issued-token-*` file instead of printing them; it does not change the active token automatically. Never share those files.

## Sketch corrections and report inspection (13 November 2026)

Existing live-rules kits and tokens remain compatible. `start` now also returns `capabilities` with the current action contract and recovery steps. Read those capabilities alongside the owner's rules; they describe available tools and do not change approval permissions.

Use `GET customers/<userId>/reports/soulmateSketch` to inspect saved answers, image URL, status and `updatedAt`. For an ambiguous soulmate gender complaint also inspect `GET customers/<userId>/reports/futurePartnerReport` and the customer's own saved gender; do not assume which report is wrong or change the customer's gender to express a partner preference.

For an explicit customer-requested change, post an action with kind `correct_sketch`, a fresh requestKey, customerId, caseId and customer evidence in reason. Payload: `{answers:{attracted_to:"male",age_group:"35-40"},expectedUpdatedAt:"<exact inspection timestamp>"}`. Send ONLY the changes actually requested. Supported changes are partner gender preference, age group, vibe, main worry and future goal; `start` returns the allowed choices. Other questionnaire answers are retained. This correction requires existing unlocked sketch access and does not need owner approval. It archives the old result, atomically updates answers, regenerates and verifies the saved image.

If the customer reports a wrong image despite matching saved preferences, use `recover_report` with `report:"soulmateSketch",force:true` once. For a provider job saved after timeout, use a new `recover_report` action with force false after 30 seconds; this resumes the SAME job. Continue bounded checks while it progresses. Reuse a request UUID only when determining the outcome of the same network request; a follow-up job check is a new action. A failed provider job may be retried, but unknown jobs must not be duplicated. Submission interrupted without a recorded job ID remains a provider-reconciliation escalation.

After completion, inspect the saved answers and image, verify app availability, then save the specific Gmail draft and apply the current labels/read state. Do not claim that an image visually matches unless it was viewed. If required answers are missing or another operator changed the record, review the latest data rather than inventing values or overwriting it.

Recovered sketch files stay private. App and support reads issue fresh, temporary viewing links; never paste those links into customer emails. For a prior inaccessible-image recovery, resume with `recover_report` and `force:false`. No kit or token change is needed for this server fix.

## Workflow

Find the customer by exact email, phone number in payment records, user ID, internal payment ID, PayU ID, or gateway transaction reference. Read the full email conversation, including previous replies. Create a support case with the Gmail thread ID, customer ID and evidence. Search by other references if the first search finds nothing; a missing account match does not establish that the customer did not pay.

The customer view shows saved birth details, payment snapshots and linked IDs, paid access, report state, available inputs, login method, latest OTP-request timestamps, and recovery history. OTP creation is **not proof of email delivery**. Codes, password hashes, image bytes and provider credentials are never returned by the support API.

Available repairs:

- Verify existing PayU, Pine Labs or Paytm orders against their gateway, then atomically restore paid access. Credits are granted once for a newly confirmed payment. Already-paid legacy orders without a fulfillment marker require review of any missing coins; consumed coins are never silently replenished.
- Restore entitlements from an existing fulfilled purchase without adding credits again.
- Request mapping for an existing, unfulfilled, unassigned legacy payment whose email exactly matches the customer. This requires gateway verification and an authorized approval, which a delegated owner can provide through Codex. Already-owned payments, immutable backup-gateway orders, absent orders, Google Play receipts and uncertain identities require developer investigation; the tool does not guess or manufacture a payment.
- Correct verified birth details, recalculate Vedic signs, update both profile and account, refresh natal context, and invalidate older dependent reports. Recover the purchased reports afterward.
- Recover paid Palm Reading, Birth Chart, Future Partner, Past Life, Astrocartography and Soulmate Sketch reports. Saved quiz answers can recover incomplete Aura Color, Spirit Animal and Witch Archetype results. Shared predictions and computed numerology/compatibility do not have per-user generation jobs; restore their purchased feature access if needed.
- Check profiles, payment snapshots, exact-email/payment-linked alternate profiles, report tables and palm storage before requesting new information. Conflicting data is blocked for review. A recovered alternate birth snapshot must be explicitly applied as a correction before report generation.
- Regenerate a saved sketch when appropriate, resuming an existing provider job before submitting another. A provider timeout leaves the action needing review; it never produces a ready reply.
- Request email corrections, compensation questions (3 coins each), or additional access grants. Each needs an audited authorized approval. A delegated owner API token can approve its own verified request; no separate business-owner intervention is required.
- Reset the Aura Color quiz with the previous result retained in the action audit. Never offer palm replacement.

Repairs have per-account concurrency guards and request UUIDs. Retrying the same UUID returns the existing action. A database transaction commits short repairs and their audit together. Never automatically retry an interrupted report job. Inspect its saved result and provider job first; owners can release an interrupted action after ten minutes. Releasing it does not restart it.

## Gmail and reply handling

The dashboard prepares and stores a reply **in the support case**. It does not connect directly to Gmail and cannot send mail. Connected Codex reads threads and saves Gmail drafts using the existing Gmail connector, following `SKILL.md`. Staff can also copy the verified reply into Gmail themselves.

Only completed saved results for unlocked features may be selected for a ready reply. Review the exact report names and issue before saving. Existing drafts must not be overwritten when a teammate intentionally edits or removes them. Drafts contain no quoted history, attachments or PDFs. Gmail sending is a separate human action.

The initial implementation is for the **website database**. Android accounts, cross-platform migrations, refunds, chargeback decisions, unidentified receipts, corrupted source data and underlying application bugs are escalation cases. There is no arbitrary SQL or arbitrary HTTP proxy endpoint.

## API

Customer endpoints also require the current `X-Support-Rules-Receipt` header, handled by the updated client. All endpoints require an individual `Authorization: Bearer ar_support_…` token, except browser login, invite activation and owner bootstrap. Tokens never authorize existing `/api/admin` endpoints. Browser writes require a matching Origin and use an HttpOnly, Secure, SameSite=Strict cookie. Responses are no-store. Support pages disable marketing/analytics and search indexing.

- `GET rules`: current version, instructions, settings, fixed safeguards and (for an API token) an opaque rules receipt. Use the client `start` command; do not print/store the receipt manually.
- `GET rules/history?offset=0`: immutable versions, 20 per page.
- `POST rules`: authorized owner browser or delegated owner API, `{baseVersion, content, settings, changeNote}`. Concurrent edits return 409.
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
| `correct_sketch` | `{answers:{age_group:"35-40"},expectedUpdatedAt:"..."}` | No; explicit customer evidence and unlocked sketch required |
| `correct_birth` | `{date:"2003-06-28",time:"12:30",place:"Raipur, Chhattisgarh, India"}` | No; record customer evidence |
| `change_email` | `{email}` | Yes |
| `add_questions` | `{questions:10}` | Yes |
| `grant_features` | `{features:["soulmateSketch"]}` | Yes |
| `link_payment` | `{paymentId}` | Yes |
| `reset_quiz` | `{report:"auraColorReport"}` | No; record customer's request |

Run `node scripts/support/client.mjs start` first. Then run `node scripts/support/client.mjs GET 'search?q=customer%40example.com'`. For writes, put JSON in a local file and pass the filename: `node scripts/support/client.mjs POST actions /path/to/request.json`. Never put credentials in prompts or command arguments.

## Validation and rollout

`node scripts/support/check-boundaries.cjs` tests actual API handlers with a mock database. `scripts/support/transaction-tests.sql` is a rollback-only test for the dedicated test account. Prepend the migration with its final COMMIT removed; the test rolls back the complete transaction. Do not run it against a database where this migration is already installed without adapting the setup. No customer emails are sent by these checks.

Install this additive migration before routing traffic to the new page. Existing purchase and login flows are retained. The Palm Reading route respects invalidated results and checks the saved sign before reusing a reading; known noon and midnight birth times remain valid. Rollback is reverting the code deployment; retain support history. Do not drop audit tables or undo successful customer repairs as part of a code rollback.

## Repeated sign-in after the sketch questionnaire (14 November 2026)

Run `GET customers/<userId>/access`. This audited check exercises the same signed-session account resolver as the app, returning the login/return path and saved-input state. It never reveals a session token, password or OTP. It does not inspect the customer's browser. The application now obtains sketch identity from the verified session, restores its page-access cookie automatically, and retains local questionnaire drafts through sign-in. No email change, password reset or entitlement change is needed for a missing local user ID. Existing personal tokens and clients support this path; run `start` to discover it.

If saved inputs exist across the account and linked records, recover the sketch and verify it before drafting readiness. If inputs are absent, do not manufacture them: after verifying this access fix, draft the specific return path (`/login?next=/soulmate-sketch`) and ask the customer to continue the questionnaire only if it appears. Do not describe an unfinished sketch as ready. An access-fix draft is appropriate even when missing answers require a customer step. Keep the case open/needs_input for that step; apply the current specific label, remove Completed and mark the handled message read after saving the draft. Do not send. Other app bugs remain technical follow-up; never claim this endpoint can repair every future bug.

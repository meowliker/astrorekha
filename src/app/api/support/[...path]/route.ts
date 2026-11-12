import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import {
  actorFor,
  db,
  checked,
  audit,
  digest,
  issueToken,
  rateLimit,
  sameOrigin,
} from "@/lib/support/auth";
import {
  SUPPORT_MAILBOX,
  SupportError,
  requireText,
  emailAddress,
  identifier,
  requireBrowserOwner,
  makeReply,
  validateDraft,
} from "@/lib/support/policy";
import { findCustomers, customerSnapshot } from "@/lib/support/customer";
import { createAction, decideAction } from "@/lib/support/actions";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
const reply = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
async function bodyOf(request: NextRequest) {
  if (Number(request.headers.get("content-length")) > 32000)
    throw new SupportError("Request too large", 413);
  const text = await request.text();
  if (text.length > 32000) throw new SupportError("Request too large", 413);
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new SupportError("Invalid request");
  }
}
async function handle(request: NextRequest) {
  try {
    const path = request.nextUrl.pathname
      .slice("/api/support/".length)
      .split("/");
    const body = request.method === "GET" ? {} : await bodyOf(request);
    if (
      request.method === "POST" &&
      ["login", "bootstrap", "activate"].includes(path[0])
    ) {
      sameOrigin(request);
      const email =
        path[0] === "activate" ? "invite" : emailAddress(body.email);
      await rateLimit(`login:${email}`, 8, 900);
      await rateLimit(
        `login-ip:${request.headers.get("x-forwarded-for")?.split(",")[0] || "local"}`,
        40,
        900,
      );
      const password = requireText(body.password, "password", 128);
      if (path[0] === "bootstrap") {
        if (password.length < 12)
          throw new SupportError(
            "Use at least 12 characters for staff passwords",
          );
        const id = checked(
          await db().rpc("support_bootstrap", {
            p_admin_token: requireText(body.adminToken, "admin session", 256),
            p_email: email,
            p_name: requireText(body.name, "name", 100),
            p_hash: await bcrypt.hash(password, 12),
          }),
        );
        return reply({ created: true, id });
      }
      let staff;
      if (path[0] === "activate") {
        if (password.length < 12)
          throw new SupportError(
            "Use at least 12 characters for staff passwords",
          );
        const tokenHash = digest(requireText(body.token, "invitation", 150));
        const invite = checked(
          await db()
            .from("support_sessions")
            .delete()
            .eq("token_hash", tokenHash)
            .eq("kind", "invite")
            .gt("expires_at", new Date().toISOString())
            .select("staff_id")
            .maybeSingle(),
        );
        if (!invite)
          throw new SupportError("Invitation expired or already used");
        staff = checked(
          await db()
            .from("support_staff")
            .update({ password_hash: await bcrypt.hash(password, 12) })
            .eq("id", invite.staff_id)
            .eq("active", true)
            .select("id,name,email,role")
            .single(),
        );
      } else {
        const row = checked(
          await db()
            .from("support_staff")
            .select("id,name,email,role,password_hash,active")
            .eq("email", email)
            .maybeSingle(),
        );
        const valid = await bcrypt.compare(
          password,
          row?.password_hash ||
            "$2b$12$GChVmV3TXdX9VHNIGf7TkuKKuUN8o1RplcG1Ftq8eZc4NXSXkX8CS",
        );
        if (!row?.active || !valid)
          throw new SupportError("Invalid email or password", 401);
        staff = {
          id: row.id,
          name: row.name,
          email: row.email,
          role: row.role,
        };
      }
      if (!staff) throw new SupportError("Staff account not found", 404);
      const session = await issueToken(staff.id, "browser");
      await audit(staff.id, "signed_in");
      const response = reply({ staff });
      response.cookies.set("ar_support", session.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/api/support",
        maxAge: session.lifetime,
      });
      return response;
    }
    const actor = await actorFor(request);
    if (request.method === "GET") {
      if (path[0] === "me")
        return reply({
          staff: {
            id: actor.id,
            name: actor.name,
            email: actor.email,
            role: actor.role,
          },
          mailbox: SUPPORT_MAILBOX,
        });
      if (path[0] === "search") {
        const q = requireText(
          request.nextUrl.searchParams.get("q"),
          "search",
          160,
        );
        const data = await findCustomers(q);
        await audit(actor.id, "customer_search", q);
        return reply(data);
      }
      if (path[0] === "customers" && path[1]) {
        const snapshot = await customerSnapshot(path[1]);
        await audit(actor.id, "customer_viewed", path[1]);
        return reply(snapshot);
      }
      if (path[0] === "cases" || path[0] === "actions") {
        const offset = Number(request.nextUrl.searchParams.get("offset") || 0);
        if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000)
          throw new SupportError("Invalid page offset");
        const isCase = path[0] === "cases";
        let query = db()
          .from(isCase ? "support_cases" : "support_actions")
          .select(
            isCase
              ? "*"
              : "id,customer_id,kind,payload,reason,status,result,actor_id,approved_by,created_at",
          )
          .order(isCase ? "updated_at" : "created_at", { ascending: false })
          .order("id", { ascending: false });
        const threadId = request.nextUrl.searchParams.get("threadId");
        if (isCase && threadId)
          query = query.eq("thread_id", identifier(threadId));
        const status = request.nextUrl.searchParams.get("status");
        if (status)
          query = query.eq("status", requireText(status, "status", 40));
        const rows = checked(await query.range(offset, offset + 99)) || [];
        return reply({
          [isCase ? "cases" : "actions"]: rows,
          nextOffset: rows.length === 100 ? offset + 100 : null,
        });
      }
      if (path[0] === "team") {
        requireBrowserOwner(actor);
        return reply({
          staff: checked(
            await db()
              .from("support_staff")
              .select("id,name,email,role,active,created_at")
              .order("created_at"),
          ),
        });
      }
      if (path[0] === "tokens")
        return reply({
          tokens: checked(
            await db()
              .from("support_sessions")
              .select("token_hash,name,created_at,expires_at")
              .eq("staff_id", actor.id)
              .eq("kind", "api"),
          ),
        });
      if (path[0] === "audit") {
        requireBrowserOwner(actor);
        return reply({
          events: checked(
            await db()
              .from("support_audit")
              .select("*")
              .order("id", { ascending: false })
              .limit(100),
          ),
        });
      }
    }
    if (request.method === "POST") {
      if (path[0] === "logout") {
        checked(
          await db()
            .from("support_sessions")
            .delete()
            .eq("token_hash", actor.tokenHash),
        );
        const response = reply({ ok: true });
        response.cookies.delete({ name: "ar_support", path: "/api/support" });
        return response;
      }
      if (path[0] === "actions")
        return reply(
          path[1]
            ? await decideAction(actor, path[1], String(body.decision))
            : await createAction(actor, body),
        );
      if (path[0] === "team") {
        requireBrowserOwner(actor);
        if (body.staffId) {
          const id = identifier(body.staffId);
          if (id === actor.id)
            throw new SupportError("You cannot disable your own owner account");
          checked(
            await db()
              .from("support_staff")
              .update({ active: false })
              .eq("id", id)
              .eq("role", "support"),
          );
          checked(
            await db().from("support_sessions").delete().eq("staff_id", id),
          );
          await audit(actor.id, "staff_disabled", id);
          return reply({ ok: true });
        }
        const email = emailAddress(body.email),
          name = requireText(body.name, "name", 100);
        const staff = checked(
          await db()
            .from("support_staff")
            .insert({ email, name, role: "support" })
            .select("id")
            .single(),
        );
        if (!staff)
          throw new SupportError("Staff invitation could not be created");
        const invitation = await issueToken(staff.id, "invite");
        await audit(actor.id, "staff_invited", staff.id);
        return reply({
          invitationUrl: `${request.nextUrl.origin}/support#invite=${invitation.token}`,
          expiresInHours: 24,
        });
      }
      if (path[0] === "tokens") {
        if (actor.kind !== "browser")
          throw new SupportError(
            "Manage API tokens from your browser session",
            403,
          );
        if (body.revoke) {
          checked(
            await db()
              .from("support_sessions")
              .delete()
              .eq("staff_id", actor.id)
              .eq("kind", "api")
              .eq("token_hash", String(body.revoke)),
          );
          await audit(actor.id, "api_token_revoked");
          return reply({ ok: true });
        }
        const name = requireText(body.name, "token name", 80);
        const token = await issueToken(actor.id, "api", name);
        await audit(actor.id, "api_token_created", name);
        return reply({ token: token.token, expiresInDays: 30 });
      }
      if (path[0] === "cases") {
        if (body.mailbox && body.mailbox !== SUPPORT_MAILBOX)
          throw new SupportError("Only the AstroRekha mailbox is permitted");
        if (path[1]) {
          const id = identifier(path[1]);
          const current = checked(
            await db().from("support_cases").select("*").eq("id", id).single(),
          );
          const patch: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
          };
          if (body.status === "resolved" && actor.kind !== "browser")
            throw new SupportError(
              "A staff member must resolve the case after review in the browser",
              403,
            );
          if (body.status) {
            if (
              ![
                "open",
                "needs_input",
                "needs_approval",
                "ready_for_review",
                "resolved",
              ].includes(String(body.status))
            )
              throw new SupportError("Invalid case status");
            if (body.status === "resolved" && !body.reviewConfirmed)
              throw new SupportError(
                "Confirm that support reviewed and resolved this case",
              );
            patch.status = body.status;
          }
          if (typeof body.issue === "string")
            patch.issue = requireText(body.issue, "issue", 6000);
          if (body.generateDraft || typeof body.draft === "string") {
            if (!current.customer_id)
              throw new SupportError(
                "Select the customer before preparing a reply",
              );
            const snapshot = await customerSnapshot(current.customer_id);
            const selected = Array.isArray(body.reportKeys)
              ? body.reportKeys
              : [];
            const ready = snapshot.reports.filter(
              (r) => selected.includes(r.key) && r.ready,
            );
            if (selected.length !== ready.length)
              throw new SupportError(
                "One or more selected reports have no verified completed result",
              );
            if (selected.includes("soulmateSketch")) {
              const sketch = checked(
                await db()
                  .from("soulmate_sketches")
                  .select("sketch_image_url")
                  .eq("user_id", current.customer_id)
                  .single(),
              );
              if (!sketch?.sketch_image_url)
                throw new SupportError("Sketch image is missing");
              try {
                await (
                  await import("@/lib/soulmate-fulfillment")
                ).downloadImage(sketch.sketch_image_url);
              } catch {
                throw new SupportError(
                  "The sketch image is not accessible. Recover it before preparing a ready reply.",
                );
              }
            }
            const draft = body.generateDraft
              ? makeReply(
                  snapshot.user.name,
                  snapshot.user.email,
                  ready.map((r) => r.name),
                )
              : String(body.draft);
            validateDraft(draft);
            if (
              /\b(ready|available|generated|fixed|restored|corrected)\b/i.test(
                draft,
              ) &&
              !ready.length
            )
              throw new SupportError(
                "Select the verified reports supporting this reply",
              );
            patch.draft = draft;
            patch.draft_verified_at = snapshot.verifiedAt;
            patch.status = "ready_for_review";
          }
          checked(await db().from("support_cases").update(patch).eq("id", id));
          await audit(actor.id, "case_updated", id, {
            fields: Object.keys(patch),
          });
          return reply({
            id,
            ...patch,
            mailbox: SUPPORT_MAILBOX,
            gmail: {
              send: false,
              label: "For Santushti",
              removeLabel: "Completed",
              markReadAfterDraft: true,
            },
          });
        }
        const customerId = body.customerId ? identifier(body.customerId) : null;
        if (customerId) await customerSnapshot(customerId);
        const threadId = body.threadId
          ? requireText(body.threadId, "Gmail thread ID", 100)
          : null;
        if (threadId && !/^[a-zA-Z0-9_-]+$/.test(threadId))
          throw new SupportError(
            "Use the thread ID from the connected Gmail account",
          );
        if (threadId) {
          const existing = checked(
            await db()
              .from("support_cases")
              .select("*")
              .eq("thread_id", threadId)
              .maybeSingle(),
          );
          if (existing) {
            if (existing.customer_id !== customerId)
              throw new SupportError(
                "This thread is already linked to another customer. Review its case before continuing.",
                409,
              );
            return reply(existing); // Preserve staff edits and make repeated imports safe.
          }
        }
        const row = checked(
          await db()
            .from("support_cases")
            .insert({
              thread_id: threadId,
              customer_id: customerId,
              subject: requireText(body.subject, "subject", 300),
              issue: requireText(body.issue, "issue", 6000),
              created_by: actor.id,
              assigned_to: actor.id,
            })
            .select("*")
            .single(),
        );
        await audit(actor.id, "case_created", row.id);
        return reply(row);
      }
    }
    throw new SupportError("Support endpoint not found", 404);
  } catch (error) {
    if (error instanceof SupportError)
      return reply({ error: error.message }, error.status);
    // Provider errors may contain credentials or customer records. Keep raw errors out of responses/logs.
    console.error("[support] Operation failed", {
      type: error instanceof Error ? error.name : "database",
    });
    return reply(
      {
        error:
          "The operation could not be completed. Check the support migration, configuration, or action history before retrying.",
      },
      500,
    );
  }
}
export const GET = handle;
export const POST = handle;

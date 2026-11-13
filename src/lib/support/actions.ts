import { sketchPatch } from "./sketch-options";
import { Actor, db, checked, audit } from "./auth";
import {
  ACTIONS,
  APPROVAL_ACTIONS,
  FEATURES,
  REPORTS,
  ReportKey,
  SupportError,
  identifier,
  emailAddress,
  requireText,
  requireBrowserOwner,
} from "./policy";
import { customerSnapshot } from "./customer";
import { calculateBirth, recoverReport } from "./reports";
import { paymentFor, purchaseBenefits, verifyPurchase } from "./payments";
export async function validatedPayload(
  kind: string,
  input: Record<string, unknown>,
  userId: string,
): Promise<Record<string, unknown>> {
  if (!ACTIONS.has(kind)) throw new SupportError("Unknown repair");
  if (kind === "correct_sketch") {
    const expectedUpdatedAt = requireText(
      input.expectedUpdatedAt,
      "saved sketch timestamp",
      50,
    );
    if (!Number.isFinite(Date.parse(expectedUpdatedAt)))
      throw new SupportError("Reload the saved sketch timestamp");
    return { answers: sketchPatch(input.answers), expectedUpdatedAt };
  }
  if (kind === "change_email") return { email: emailAddress(input.email) };
  if (kind === "add_questions") {
    const questions = Number(input.questions);
    if (!Number.isInteger(questions) || questions < 1 || questions > 100)
      throw new SupportError("Enter 1–100 questions");
    return { questions };
  }
  if (kind === "grant_features") {
    if (
      !Array.isArray(input.features) ||
      !input.features.length ||
      !input.features.every((f) => (FEATURES as readonly unknown[]).includes(f))
    )
      throw new SupportError("Select valid features");
    return { features: input.features };
  }
  if (kind === "recover_report") {
    if (typeof input.report !== "string" || !(input.report in REPORTS))
      throw new SupportError("Select a report");
    return { report: input.report, force: input.force === true };
  }
  if (kind === "reset_quiz") {
    if (input.report !== "auraColorReport")
      throw new SupportError("Only the Aura Color quiz reset is supported");
    return { report: "auraColorReport" };
  }
  if (kind === "correct_birth") {
    const date = requireText(input.date, "birth date", 10),
      time = requireText(input.time, "birth time", 5),
      place = requireText(input.place, "birthplace", 200);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
    )
      throw new SupportError("Enter a valid date and 24-hour time");
    const [year, month, day] = date.split("-");
    const [h, m] = time.split(":");
    if (
      new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date ||
      Number(year) < 1900 ||
      Date.parse(date) > Date.now()
    )
      throw new SupportError("Invalid birth date");
    return {
      date,
      time,
      place,
      birthInput: {
        birthYear: year,
        birthMonth: month,
        birthDay: day,
        birthHour: String(Number(h) % 12 || 12),
        birthMinute: m,
        birthPeriod: Number(h) >= 12 ? "PM" : "AM",
        birthPlace: place,
        knowsBirthTime: true,
      },
    };
  }
  const paymentId = identifier(input.paymentId);
  const p = await paymentFor(paymentId, userId, kind === "link_payment");
  if (kind === "restore_access") {
    if (
      !p.fulfilled_at ||
      !["paid", "success", "captured"].includes(p.payment_status)
    )
      throw new SupportError("Reconcile this purchase first");
    return { paymentId, features: purchaseBenefits(p).features };
  }
  return { paymentId };
}
export async function createAction(
  actor: Actor,
  body: Record<string, unknown>,
) {
  const customerId = identifier(body.customerId),
    kind = requireText(body.kind, "action", 40),
    reason = requireText(body.reason, "reason / customer evidence", 2000);
  const requestKey = requireText(body.requestKey, "request key", 36);
  if (!/^[a-f0-9-]{36}$/.test(requestKey))
    throw new SupportError("Use a UUID request key");
  const existing = checked(
    await db()
      .from("support_actions")
      .select("id,status,result,kind,customer_id")
      .eq("actor_id", actor.id)
      .eq("request_key", requestKey)
      .maybeSingle(),
  );
  if (existing) {
    if (existing.kind !== kind || existing.customer_id !== customerId)
      throw new SupportError(
        "Request key already used for another repair",
        409,
      );
    return existing;
  }
  await customerSnapshot(customerId);
  const payload = await validatedPayload(
    kind,
    (body.payload || {}) as Record<string, unknown>,
    customerId,
  );
  const caseId = body.caseId ? identifier(body.caseId) : null;
  if (caseId) {
    const c = checked(
      await db()
        .from("support_cases")
        .select("customer_id")
        .eq("id", caseId)
        .single(),
    );
    if (!c || c.customer_id !== customerId)
      throw new SupportError("Case belongs to a different customer");
  }
  const action = checked(
    await db()
      .from("support_actions")
      .insert({
        actor_id: actor.id,
        request_key: requestKey,
        customer_id: customerId,
        case_id: caseId,
        kind,
        payload,
        reason,
        status: APPROVAL_ACTIONS.has(kind) ? "awaiting_approval" : "running",
      })
      .select("*")
      .single(),
  );
  await audit(actor.id, "repair_requested", customerId, {
    actionId: action.id,
    kind,
  });
  checked(
    await db()
      .from("support_cases")
      .update({
        draft_verified_at: null,
        status: APPROVAL_ACTIONS.has(kind) ? "needs_approval" : "open",
        updated_at: new Date().toISOString(),
      })
      .eq("customer_id", customerId)
      .or(
        caseId ? `status.neq.resolved,id.eq.${caseId}` : "status.neq.resolved",
      ),
  );
  if (action.status === "awaiting_approval")
    return { id: action.id, status: action.status };
  return executeAction(action);
}
type Action = {
  id: string;
  customer_id: string;
  kind: string;
  payload: Record<string, unknown>;
  actor_id: string;
};
export async function executeAction(action: Action) {
  try {
    let result: Record<string, unknown>;
    const payload = { ...action.payload };
    if (action.kind === "correct_sketch") {
      const current = checked(
        await db()
          .from("soulmate_sketches")
          .select("updated_at,status")
          .eq("user_id", action.customer_id)
          .maybeSingle(),
      );
      if (
        !current ||
        Date.parse(current.updated_at) !==
          Date.parse(String(payload.expectedUpdatedAt))
      )
        throw new SupportError(
          "Sketch changed. Reload the customer and review the latest saved answers before correcting.",
          409,
        );
      if (current.status === "generating")
        throw new SupportError(
          "Recover the existing sketch job before correcting its answers. Do not submit a duplicate job.",
          409,
        );
      checked(
        await db().rpc("support_prepare_sketch_correction", {
          p_action: action.id,
        }),
      );
      result = await recoverReport(
        action.customer_id,
        "soulmateSketch",
        true,
        action.id,
        true,
      );
    } else if (action.kind === "recover_report")
      result = await recoverReport(
        action.customer_id,
        payload.report as ReportKey,
        payload.force === true,
        action.id,
      );
    else {
      if (
        action.kind === "reconcile_payment" ||
        action.kind === "link_payment"
      ) {
        const payment = await paymentFor(
          String(payload.paymentId),
          action.customer_id,
          action.kind === "link_payment",
        );
        Object.assign(payload, await verifyPurchase(payment), {
          verifiedAmount: payment.amount,
        });
      }
      if (action.kind === "restore_access") {
        const p = await paymentFor(
          String(payload.paymentId),
          action.customer_id,
        );
        Object.assign(payload, { features: purchaseBenefits(p).features });
      }
      if (action.kind === "correct_birth") {
        const c = await calculateBirth(
          payload.birthInput as Record<string, unknown>,
        );
        const b = c.snapshot;
        payload.natal = {
          chart: c.result.chart,
          dasha: c.result.dasha,
          signs: c.signs,
          birth_data: payload.birthInput,
        };
        payload.fields = {
          birth_month: b.birthMonth,
          birth_day: b.birthDay,
          birth_year: b.birthYear,
          birth_hour: b.birthHour,
          birth_minute: b.birthMinute,
          birth_period: b.birthPeriod,
          birth_place: b.birthPlace,
          sun_sign: c.signs.sun,
          moon_sign: c.signs.moon,
          ascendant_sign: c.signs.ascendant,
        };
      }
      checked(
        await db()
          .from("support_actions")
          .update({ payload })
          .eq("id", action.id)
          .eq("status", "running"),
      );
      result = checked(
        await db().rpc("support_apply", { p_action: action.id }),
      );
      return { id: action.id, status: "complete", result };
    }
    checked(
      await db()
        .from("support_actions")
        .update({
          status: "complete",
          result,
          finished_at: new Date().toISOString(),
        })
        .eq("id", action.id)
        .eq("status", "running"),
    );
    await audit(action.actor_id, "report_verified", action.customer_id, {
      actionId: action.id,
      result,
    });
    return { id: action.id, status: "complete", result };
  } catch (error) {
    const message =
      error instanceof SupportError
        ? error.message
        : "Recovery needs review. No customer-ready reply has been prepared. Check the saved state before retrying.";
    // Atomic repairs may have committed despite a disconnected response. Never overwrite completion.
    const saved = checked(
      await db()
        .from("support_actions")
        .select("status,result")
        .eq("id", action.id)
        .single(),
    );
    if (saved?.status === "complete") return { id: action.id, ...saved };
    checked(
      await db()
        .from("support_actions")
        .update({
          status: "needs_review",
          result: { message },
          finished_at: new Date().toISOString(),
        })
        .eq("id", action.id)
        .eq("status", "running"),
    );
    await audit(action.actor_id, "repair_needs_review", action.customer_id, {
      actionId: action.id,
    });
    return { id: action.id, status: "needs_review", result: { message } };
  }
}
export async function decideAction(actor: Actor, id: string, decision: string) {
  requireBrowserOwner(actor);
  if (!["approve", "reject", "release"].includes(decision))
    throw new SupportError("Invalid decision");
  const action = checked(
    await db()
      .from("support_actions")
      .select("*")
      .eq("id", identifier(id))
      .single(),
  );
  if (decision === "release") {
    if (
      action.status !== "running" ||
      Date.now() - Date.parse(action.created_at) < 10 * 60000
    )
      throw new SupportError(
        "Only an interrupted repair older than ten minutes can be released",
      );
    checked(
      await db()
        .from("support_actions")
        .update({
          status: "needs_review",
          result: {
            message:
              "Owner released interrupted repair. Inspect saved state before retrying.",
          },
        })
        .eq("id", id)
        .eq("status", "running"),
    );
    await audit(actor.id, "repair_released", id);
    return { status: "needs_review" };
  }
  if (action.status !== "awaiting_approval")
    throw new SupportError(
      "This approval request has already been handled",
      409,
    );
  const claimed = checked(
    await db()
      .from("support_actions")
      .update({
        status: decision === "approve" ? "running" : "rejected",
        approved_by: actor.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "awaiting_approval")
      .select("*")
      .maybeSingle(),
  );
  if (!claimed) throw new SupportError("Request already handled", 409);
  await audit(actor.id, `repair_${decision}d`, id);
  return decision === "approve"
    ? executeAction(claimed)
    : { id, status: "rejected" };
}

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { witchAdminSummary, witchAdminAnswers, type WitchAdminUser, type WitchSavedRow, type WitchAdminDetail } from "@/lib/witch-archetype-admin";
import { isWitchResult } from "@/lib/witch-archetype";
import { isWitchTemplate } from "@/lib/witch-archetype-template";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 25;
const USER_FIELDS = "id,name,email,unlocked_features,is_dev_tester";
const REPORT_FIELDS = "answers,result,scoring_version,generated_at,updated_at";
function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}
export async function GET(request: NextRequest) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return json({ error: "Please sign in as an admin." }, 401);
  try {
    const db = getSupabaseAdmin({ fresh: true });
    const session = await db.from("admin_sessions").select("id,expires_at").eq("id", token).maybeSingle();
    if (session.error) throw session.error;
    const expiry = Date.parse(session.data?.expires_at || "");
    if (!session.data || !Number.isFinite(expiry) || expiry <= Date.now()) return json({ error: "Admin session expired. Please sign in again." }, 401);
    const params = request.nextUrl.searchParams;
    const userId = params.get("userId");
    if (userId) {
      if (userId.length > 200) return json({ error: "Invalid customer ID." }, 400);
      const [user, saved, payments] = await Promise.all([
        db.from("users").select(USER_FIELDS).eq("id", userId).maybeSingle(),
        db.from("witch_archetype_results").select(REPORT_FIELDS).eq("user_id", userId).maybeSingle(),
        db.from("payments").select("id,type,bundle_id,feature,amount,currency,payment_status,created_at")
          .eq("user_id", userId).or("feature.ilike.%witch%,bundle_id.ilike.%witch%")
          .order("created_at", { ascending: false }).order("id").limit(101),
      ]);
      if (user.error || saved.error || payments.error) throw user.error || saved.error || payments.error;
      if (!user.data) return json({ error: "Customer not found." }, 404);
      const result = isWitchResult(saved.data?.result) ? saved.data.result : null;
      let template = null, templateVersion = null;
      let warning = saved.data && !result ? "The saved result is invalid or uses an unsupported scoring version." : null;
      if (result) {
        const stored = await db.from("witch_archetype_templates").select("report_data,template_version,active").eq("id", result.key).maybeSingle();
        if (stored.error) throw stored.error;
        if (isWitchTemplate(stored.data?.report_data, result.key)) {
          template = stored.data!.report_data; templateVersion = stored.data!.template_version;
          if (!stored.data!.active) warning = "This report template is inactive. Customers cannot currently load it.";
        } else warning = "The report template is missing or invalid. Customers cannot currently load it.";
      }
      const answers = saved.data ? witchAdminAnswers(saved.data.answers) : [];
      if (answers.some(a => !a.valid)) warning = [warning, "Some saved quiz answers are missing or unrecognized."].filter(Boolean).join(" ");
      const detail: WitchAdminDetail = {
        ...witchAdminSummary(user.data, saved.data), result, template, templateVersion,
        scoringVersion: saved.data?.scoring_version || null, updatedAt: saved.data?.updated_at || null,
        warning, answers, paymentsTruncated: (payments.data?.length || 0) > 100,
        payments: (payments.data || []).slice(0, 100).map(p => ({ ...p, amount: Number(p.amount || 0) / 100, currency: p.currency || "INR" })),
      };
      return json(detail);
    }
    const page = Number(params.get("page") || 0);
    if (!Number.isInteger(page) || page < 0 || page > 10000) return json({ error: "Invalid page." }, 400);
    const mode = params.get("mode") || "saved";
    if (!["saved", "access"].includes(mode)) return json({ error: "Invalid report filter." }, 400);
    const search = (params.get("search") || "").replace(/[^\p{L}\p{N} @._+-]/gu, "").slice(0, 100).replaceAll("_", "\\_");
    // The FK makes this a one-to-one embed. Inner join includes saved reports even if access was revoked.
    let query = db.from("users").select(`${USER_FIELDS},witch_archetype_results${mode === "saved" ? "!inner" : ""}(result,generated_at)`, { count: "exact" });
    if (mode === "access") query = query.or("unlocked_features->>witchArchetypeReport.eq.true,is_dev_tester.eq.true");
    if (search) query = query.or(`id.ilike.%${search}%,email.ilike.%${search}%,name.ilike.%${search}%`);
    const rows = await query.order("created_at", { ascending: false }).order("id").range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (rows.error) throw rows.error;
    const items = (rows.data || []).map(row => {
      const embedded = row.witch_archetype_results;
      const saved = (Array.isArray(embedded) ? embedded[0] : embedded) || null;
      return witchAdminSummary(row as unknown as WitchAdminUser, saved as WitchSavedRow | null);
    });
    return json({ items, total: rows.count || 0, page, pageSize: PAGE_SIZE });
  } catch {
    return json({ error: "Unable to load Witch Archetype data. Please retry; if it continues, check the database connection and report tables." }, 503);
  }
}

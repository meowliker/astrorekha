import {withAdminAccess} from "@/lib/admin-access";
import { NextRequest, NextResponse } from "next/server";
import { soulmateAdmin } from "@/lib/soulmate-admin";
import {
  digest, newViewerPassword, normalizeViewerEmail, sameViewerOrigin, validViewerId, viewerFields, viewerPermissions, viewerTable,
} from "@/lib/partner-analytics-access";

export const dynamic = "force-dynamic";
const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

async function handleGET(request: NextRequest) {
  try {
    const db = await soulmateAdmin(request);
    if (!db) return json({ error: "Unauthorized." }, 401);
    const { data, error } = await db.from(viewerTable).select(viewerFields).order("created_at", { ascending: false });
    if (error) throw error;
    return json({ viewers: data });
  } catch {
    return json({ error: "Analytics access management is temporarily unavailable." }, 503);
  }
}

async function handlePOST(request: NextRequest) {
  if (!sameViewerOrigin(request)) return json({ error: "Invalid request origin." }, 403);
  try {
    const db = await soulmateAdmin(request);
    if (!db) return json({ error: "Unauthorized." }, 401);
    const body = await request.json().catch(() => null);
    if (body?.action === "create") {
      const email = normalizeViewerEmail(body.email);
      const label = typeof body.label === "string" ? body.label.trim() : "";
      if (!email || !label || label.length > 100) return json({ error: "Enter a name and a valid email." }, 400);
      const password = newViewerPassword();
      const { data, error } = await db.from(viewerTable)
        .insert({ email, label, password_hash: digest(password), ...viewerPermissions(body) }).select(viewerFields).single();
      if (error?.code === "23505") return json({ error: "A viewer with this email already exists." }, 409);
      if (error) throw error;
      return json({ viewer: data, password }, 201);
    }
    if (!validViewerId(body?.id) || !["update", "reset"].includes(body?.action)) return json({ error: "Invalid account action." }, 400);
    const password = body.action === "reset" ? newViewerPassword() : null;
    if (!password && [body.active, body.traffic, body.purchases, body.revenue, body.channels].some(value => typeof value !== "boolean")) {
      return json({ error: "Invalid viewer permissions." }, 400);
    }
    const patch = password ? { password_hash: digest(password) } : { active: body.active, ...viewerPermissions(body) };
    const { data, error } = await db.from(viewerTable).update(patch).eq("id", body.id).select(viewerFields).maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: "Viewer not found." }, 404);
    return json({ viewer: data, ...(password ? { password } : {}) });
  } catch {
    return json({ error: "Unable to save analytics access." }, 503);
  }
}

export const GET=withAdminAccess(handleGET);
export const POST=withAdminAccess(handlePOST);

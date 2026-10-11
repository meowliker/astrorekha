import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { normalizeTrackingView, type TrackingSavedView } from "@/lib/tracking-views";

export const dynamic = "force-dynamic";
const PREFIX = "tracking_view_";
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function authorized(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  const token = request.headers.get("x-admin-session");
  if (!token) return null;
  const { data, error } = await supabase.from("admin_sessions").select("id,expires_at").eq("id", token).maybeSingle();
  return !error && data && new Date(data.expires_at) > new Date() ? supabase : null;
}

function validId(id: unknown): id is string {
  return typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id);
}

function savedView(value: unknown): TrackingSavedView | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const config = normalizeTrackingView(row);
  if (!validId(row.id) || typeof row.name !== "string" || !config) return null;
  return {
    ...config, id: row.id, name: row.name.slice(0, 60),
    createdAt: String(row.createdAt || ""), updatedAt: String(row.updatedAt || ""),
  };
}

/** One settings row per shared view avoids a migration and cross-admin array overwrites. */
export async function GET(request: NextRequest) {
  const supabase = await authorized(request);
  if (!supabase) return response({ error: "Unauthorized" }, 401);
  const { data, error } = await supabase.from("settings").select("key,value").like("key", `${PREFIX}%`).limit(100);
  if (error) return response({ error: "Unable to load views" }, 500);
  const views = (data || []).filter((row) => row.key.startsWith(PREFIX))
    .map((row) => savedView(row.value)).filter((row): row is TrackingSavedView => !!row)
    .sort((a, b) => a.name.localeCompare(b.name));
  return response({ views });
}

export async function POST(request: NextRequest) {
  const supabase = await authorized(request);
  if (!supabase) return response({ error: "Unauthorized" }, 401);
  const body = await request.json().catch(() => null);
  const name = String(body?.name || "").trim().slice(0, 60);
  const config = normalizeTrackingView(body?.config);
  if (!name || !config) return response({ error: "Enter a view name and select at least one column." }, 400);
  const now = new Date().toISOString();
  const view: TrackingSavedView = { ...config, id: randomUUID(), name, createdAt: now, updatedAt: now };
  const { error } = await supabase.from("settings").insert({ key: `${PREFIX}${view.id}`, value: view, updated_at: now });
  if (error) return response({ error: "Unable to save view" }, 500);
  return response({ view }, 201);
}

export async function PUT(request: NextRequest) {
  const supabase = await authorized(request);
  if (!supabase) return response({ error: "Unauthorized" }, 401);
  const body = await request.json().catch(() => null);
  if (!validId(body?.id)) return response({ error: "Invalid view" }, 400);
  const key = `${PREFIX}${body.id}`;
  const { data: existing } = await supabase.from("settings").select("value").eq("key", key).maybeSingle();
  const previous = savedView(existing?.value);
  if (!previous) return response({ error: "View not found" }, 404);
  const name = String(body?.name || previous.name).trim().slice(0, 60);
  const config = normalizeTrackingView(body?.config);
  if (!name || !config) return response({ error: "Invalid view settings" }, 400);
  const view: TrackingSavedView = { ...config, id: previous.id, name, createdAt: previous.createdAt, updatedAt: new Date().toISOString() };
  const { error } = await supabase.from("settings").update({ value: view, updated_at: view.updatedAt }).eq("key", key);
  if (error) return response({ error: "Unable to update view" }, 500);
  return response({ view });
}

export async function DELETE(request: NextRequest) {
  const supabase = await authorized(request);
  if (!supabase) return response({ error: "Unauthorized" }, 401);
  const id = request.nextUrl.searchParams.get("id");
  if (!validId(id)) return response({ error: "Invalid view" }, 400);
  const { error } = await supabase.from("settings").delete().eq("key", `${PREFIX}${id}`);
  if (error) return response({ error: "Unable to delete view" }, 500);
  return response({ success: true });
}

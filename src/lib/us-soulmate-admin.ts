import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "./supabase-admin";
export async function soulmateAdmin(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return null;
  const db = getSupabaseAdmin({ fresh: true });
  const { data, error } = await db.from("admin_sessions").select("id,expires_at").eq("id", token).maybeSingle();
  if (error || !data || !Number.isFinite(Date.parse(data.expires_at)) || Date.parse(data.expires_at) <= Date.now()) return null;
  return db;
}
export const validSoulmateId = (id: string) => /^us_sm_[a-f0-9]{20}$/.test(id);

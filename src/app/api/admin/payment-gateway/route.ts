import { pineLabsConfig, pineLabsSigningConfigured } from "@/lib/pinelabs-api";
import { NextRequest, NextResponse } from "next/server";
import { soulmateAdmin } from "@/lib/soulmate-admin";
import { paytmConfig } from "@/lib/paytm-api";
import { localPaymentGateway } from "@/lib/local-payment-gateway";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const db = await soulmateAdmin(request);
  if (!db) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const setting = await db.from("settings").select("value").eq("key", "payment_gateway").maybeSingle();
  if (setting.error) return NextResponse.json({ error: "Unable to read gateway setting" }, { status: 503 });
  let paytmReady = false;
  try {
    if (process.env.PAYTM_ENABLED === "true" && paytmConfig().mode === "live") {
      const schema = await db.rpc("paytm_backup_schema_version");
      paytmReady = !schema.error && schema.data === 1;
    }
  } catch { /* Show setup needed. */ }
  let pineLabsReady = false;
  try {
    if (process.env.PINELABS_ENABLED === "true" && pineLabsSigningConfigured() && pineLabsConfig().mode === "live") {
      const schema = await db.rpc("pinelabs_backup_schema_version");
      pineLabsReady = !schema.error && schema.data === 1;
    }
  } catch { /* Setup needed. */ }
  return NextResponse.json({ pineLabsReady, active: localPaymentGateway() || setting.data?.value?.active || "payu", paytmReady }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: NextRequest) {
  const db = await soulmateAdmin(request);
  if (!db) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (localPaymentGateway()) return NextResponse.json({ error: "Local checkout uses LOCAL_PAYMENT_GATEWAY. Change the local environment to switch; the production setting is protected." }, { status: 400 });
  try {
    const { active } = await request.json();
    if (active !== "payu" && active !== "paytm" && active !== "pinelabs") return NextResponse.json({ error: "Invalid gateway" }, { status: 400 });
    if (active === "paytm") {
      if (process.env.PAYTM_ENABLED !== "true" || paytmConfig().mode !== "live") throw new Error("Paytm production setup is not enabled");
      const schema = await db.rpc("paytm_backup_schema_version");
      if (schema.error || schema.data !== 1) throw new Error("Apply the Paytm database migration first");
    } else if (active === "pinelabs") {
      if (process.env.PINELABS_ENABLED !== "true" || !pineLabsSigningConfigured() || pineLabsConfig().mode !== "live") throw new Error("Pine Labs production setup is not enabled");
      const schema = await db.rpc("pinelabs_backup_schema_version");
      if (schema.error || schema.data !== 1) throw new Error("Apply the Pine Labs database migration first");
    } else if (!process.env.PAYU_MERCHANT_KEY || !process.env.PAYU_MERCHANT_SALT) throw new Error("PayU is not configured");
    const saved = await db.from("settings").upsert({ key: "payment_gateway", value: { active, changedAt: new Date().toISOString() }, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (saved.error) throw new Error("Unable to save gateway selection");
    return NextResponse.json({ active });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to switch gateway" }, { status: 400 }); }
}

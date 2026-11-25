import {withAdminAccess} from "@/lib/admin-access";
import { isPaymentGateway, paymentProvider } from "@/lib/payments/providers";
import { NextRequest, NextResponse } from "next/server";
import { soulmateAdmin } from "@/lib/soulmate-admin";
import { localPaymentGateway } from "@/lib/local-payment-gateway";
export const dynamic = "force-dynamic";
async function handleGET(request: NextRequest) {
  const db = await soulmateAdmin(request);
  if (!db) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const setting = await db.from("settings").select("value").eq("key", "payment_gateway").maybeSingle();
  if (setting.error) return NextResponse.json({ error: "Unable to read gateway setting" }, { status: 503 });
  const ready = async (gateway: "paytm" | "pinelabs" | "airpay" | "shiprocket") => {
    try { await paymentProvider(gateway).assertReady(db, true); return true; }
    catch { return false; }
  };
  const [paytmReady, pineLabsReady, airpayReady, shiprocketReady] = await Promise.all([ready("paytm"), ready("pinelabs"), ready("airpay"), ready("shiprocket")]);
  return NextResponse.json({ shiprocketReady, airpayReady, pineLabsReady, active: localPaymentGateway() || setting.data?.value?.active || "payu", paytmReady }, { headers: { "Cache-Control": "no-store" } });
}
async function handlePOST(request: NextRequest) {
  const db = await soulmateAdmin(request);
  if (!db) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (localPaymentGateway()) return NextResponse.json({ error: "Local checkout uses LOCAL_PAYMENT_GATEWAY. Change the local environment to switch; the production setting is protected." }, { status: 400 });
  try {
    const { active } = await request.json();
    if (!isPaymentGateway(active)) return NextResponse.json({ error: "Invalid gateway" }, { status: 400 });
    await paymentProvider(active).assertReady(db, true);
    const saved = await db.from("settings").upsert({ key: "payment_gateway", value: { active, changedAt: new Date().toISOString() }, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (saved.error) throw new Error("Unable to save gateway selection");
    return NextResponse.json({ active });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to switch gateway" }, { status: 400 }); }
}

export const GET=withAdminAccess(handleGET);
export const POST=withAdminAccess(handlePOST);

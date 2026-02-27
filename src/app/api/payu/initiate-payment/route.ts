import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_PRICING, type PricingConfig } from "@/lib/pricing";

// Fetch dynamic pricing from database
async function getPricingConfig(): Promise<PricingConfig> {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "pricing")
      .maybeSingle();
    
    return data?.value || DEFAULT_PRICING;
  } catch {
    return DEFAULT_PRICING;
  }
}

function generateHash(params: Record<string, string>, salt: string): string {
  // PayU hash sequence: key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt
  const hashString = `${params.key}|${params.txnid}|${params.amount}|${params.productinfo}|${params.firstname}|${params.email}|${params.udf1 || ""}|${params.udf2 || ""}|${params.udf3 || ""}|${params.udf4 || ""}|${params.udf5 || ""}||||||${salt}`;
  return crypto.createHash("sha512").update(hashString).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    const { type, bundleId, packageId, userId, email, firstName } = await request.json();

    const merchantKey = process.env.PAYU_MERCHANT_KEY;
    const merchantSalt = process.env.PAYU_MERCHANT_SALT;

    if (!merchantKey || !merchantSalt) {
      return NextResponse.json(
        { error: "PayU not configured" },
        { status: 500 }
      );
    }

    // Fetch dynamic pricing from database
    const pricing = await getPricingConfig();

    let amount: number;
    let productInfo: string;
    let metadata: Record<string, string> = {
      userId: userId || "",
      type: type || "",
    };

    if (type === "bundle") {
      const bundle = pricing.bundles.find(b => b.id === bundleId);
      if (!bundle) {
        return NextResponse.json({ error: `Invalid bundle: ${bundleId}` }, { status: 400 });
      }
      amount = bundle.price;
      productInfo = bundle.name;
      metadata.bundleId = bundleId;
      metadata.features = JSON.stringify(bundle.features);
    } else if (type === "upsell") {
      const upsell = pricing.upsells.find(u => u.id === (bundleId || packageId));
      if (!upsell) {
        return NextResponse.json({ error: "Invalid upsell" }, { status: 400 });
      }
      amount = upsell.price;
      productInfo = upsell.name;
      metadata.feature = upsell.feature;
    } else if (type === "coins") {
      const coinPkg = pricing.coinPackages.find(c => c.id === packageId);
      if (!coinPkg) {
        return NextResponse.json({ error: "Invalid coin package" }, { status: 400 });
      }
      amount = coinPkg.price;
      productInfo = `${coinPkg.coins} Coins`;
      metadata.coins = coinPkg.coins.toString();
    } else if (type === "report") {
      const report = pricing.reports.find(r => r.id === packageId);
      if (!report) {
        return NextResponse.json({ error: "Invalid report" }, { status: 400 });
      }
      amount = report.price;
      productInfo = report.name;
      metadata.feature = report.feature;
      metadata.reportId = packageId;
    } else {
      return NextResponse.json({ error: "Invalid purchase type" }, { status: 400 });
    }

    // Generate unique transaction ID
    const txnId = `TXN_${Date.now()}_${(userId || "anon").slice(-6)}`;

    // Prepare PayU parameters
    const payuParams = {
      key: merchantKey,
      txnid: txnId,
      amount: amount.toFixed(2),
      productinfo: productInfo,
      firstname: firstName || "Customer",
      email: email || "customer@astrorekha.com",
      phone: "",
      udf1: userId || "",
      udf2: type || "",
      udf3: bundleId || packageId || "",
      udf4: metadata.feature || "",
      udf5: metadata.coins || "",
    };

    // Generate hash
    const hash = generateHash(payuParams, merchantSalt);

    // Save payment record in background (non-blocking for faster checkout)
    const supabase = getSupabaseAdmin();
    (async () => {
      try {
        await supabase.from("payments").insert({
          id: `pay_${txnId}`,
          payu_txn_id: txnId,
          user_id: userId || null,
          type,
          bundle_id: bundleId || packageId || null,
          feature: metadata.feature || null,
          coins: metadata.coins ? parseInt(metadata.coins) : null,
          customer_email: email || null,
          amount: amount * 100, // Store in paise for consistency
          currency: "INR",
          payment_status: "created",
          created_at: new Date().toISOString(),
        });
      } catch (err) {
        console.error("Failed to save payment record:", err);
      }
    })();

    return NextResponse.json({
      txnId,
      amount: payuParams.amount,
      productInfo,
      hash,
      key: merchantKey,
      firstName: payuParams.firstname,
      email: payuParams.email,
      udf1: payuParams.udf1,
      udf2: payuParams.udf2,
      udf3: payuParams.udf3,
      udf4: payuParams.udf4,
      udf5: payuParams.udf5,
    });
  } catch (error: any) {
    console.error("PayU initiate payment error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to initiate payment" },
      { status: 500 }
    );
  }
}

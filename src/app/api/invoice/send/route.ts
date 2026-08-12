import { NextRequest, NextResponse } from "next/server";
import { buildCombinedOrderInvoice, sendCombinedOrderInvoiceEmail } from "@/lib/order-invoice";
import { sendInvoiceDeliveryWhatsapp } from "@/lib/whatsapp-invoice";

export const dynamic = "force-dynamic";

function normalize(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const mainTxnId = String(body.mainTxnId || body.txnId || "").trim();
    const upsellTxnIds = Array.isArray(body.upsellTxnIds) ? body.upsellTxnIds : [];
    const txnIds = [
      mainTxnId,
      ...upsellTxnIds.map((txnId: unknown) => String(txnId || "").trim()),
    ].filter(Boolean);
    const userId = String(body.userId || "").trim();
    const email = normalize(body.email);

    if (!mainTxnId) {
      return NextResponse.json({ error: "mainTxnId is required" }, { status: 400 });
    }

    if (!userId && !email) {
      return NextResponse.json({ error: "userId or email is required" }, { status: 400 });
    }

    const invoice = await buildCombinedOrderInvoice(txnIds);
    const ownsInvoice =
      (!!userId && userId === invoice.customer.userId) ||
      (!!email && email === normalize(invoice.customer.email));

    if (!ownsInvoice) {
      return NextResponse.json({ error: "Invoice not found for this customer" }, { status: 404 });
    }

    const sentInvoice = await sendCombinedOrderInvoiceEmail(txnIds);
    const whatsappResult = await sendInvoiceDeliveryWhatsapp(sentInvoice, txnIds).catch((error) => {
      console.error("[invoice/send] whatsapp invoice failed:", error);
      return { success: false, status: "failed" as const, reason: "unexpected_error" };
    });

    return NextResponse.json({
      success: true,
      invoiceNumber: sentInvoice.invoiceNumber,
      itemCount: sentInvoice.items.length,
      total: sentInvoice.total,
      whatsapp: whatsappResult.status,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to send invoice";
    console.error("[invoice/send] error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

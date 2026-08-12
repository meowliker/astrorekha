import { NextRequest, NextResponse } from "next/server";
import { verifyInvoiceAccessToken } from "@/lib/invoice-access-token";
import { buildCombinedOrderInvoice, generateOrderInvoicePdf } from "@/lib/order-invoice";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token")?.trim() || "";
    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }

    const txnIds = verifyInvoiceAccessToken(token);
    const invoice = await buildCombinedOrderInvoice(txnIds);
    const pdf = generateOrderInvoicePdf(invoice);

    return new NextResponse(Uint8Array.from(pdf).buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${invoice.invoiceNumber}.pdf"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to generate invoice document";
    console.error("[invoice/document] error:", error);
    return NextResponse.json({ error: message }, { status: 404 });
  }
}

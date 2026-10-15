import { soulmateReceiptItemName } from "./soulmate-product-names";
import crypto from "crypto";
import { jsPDF } from "jspdf";
import type { SoulmateLineItem, SoulmateEntitlements } from "./soulmate-cart";

export type InvoiceSnapshot = {
  customerName: string; customerEmail: string; orderId: string | null;
  items: SoulmateLineItem[]; entitlements: SoulmateEntitlements;
  subtotal: number; gst: number; total: number; paidAt: string | null;
  deliveryDueAt: string | null;
};
export type SoulmateInvoiceDocument = { invoice_number: string; issued_at: string; snapshot: InvoiceSnapshot };
const amount = (value: number) => (value / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (value: string) => new Date(value).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const features = (s: InvoiceSnapshot) => [s.entitlements.sketch === "colour" ? "Your soulmate sketch in full colour" : "Your soulmate sketch in black & white", ...(s.entitlements.description ? ["Full written soulmate reading & description"] : []), ...(s.entitlements.timeline ? ["Soulmate Connection Timeline"] : []), `Delivery within ${s.entitlements.promised_hours} hours of payment confirmation`];

export function soulmateConfirmationEmail(invoice: SoulmateInvoiceDocument) {
  const s = invoice.snapshot;
  const lines = s.items.map((item) => `<tr><td style="padding:17px 0;border-bottom:1px solid #e8dfe2;font-size:14px;line-height:22px;color:#332633">${escape(soulmateReceiptItemName(item))}</td><td style="padding:17px 0 17px 20px;border-bottom:1px solid #e8dfe2;text-align:right;white-space:nowrap;font-size:14px;color:#332633">₹${amount(item.amount_paise)}</td></tr>`).join("");
  const totalRow = (label: string, value: number, bold = false) => `<tr><td style="padding-top:12px;font-size:${bold ? 18 : 14}px;font-weight:${bold ? 700 : 400};color:#332633">${label}</td><td style="padding-top:12px;text-align:right;font-size:${bold ? 20 : 14}px;font-weight:${bold ? 700 : 400};color:#332633">₹${amount(value)}</td></tr>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your AstroRekha order is confirmed</title></head><body style="margin:0;background:#f6f1ef;font-family:Arial,Helvetica,sans-serif;color:#332633">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">Your order is confirmed. Your summary and PDF invoice are inside.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f1ef"><tr><td align="center" style="padding:32px 12px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#fff;border:1px solid #e8dfe2;border-radius:16px;overflow:hidden">
<tr><td style="background:#211321;padding:36px 32px 32px;text-align:center;color:#fff"><p style="margin:0 0 24px;color:#d8b779;font-size:13px;letter-spacing:4px">✦ &nbsp; ASTROREKHA &nbsp; ✦</p><p style="margin:0 0 12px;color:#eac3ce;font-size:11px;letter-spacing:2px">ORDER CONFIRMATION</p><h1 style="margin:0;font-family:Georgia,serif;font-weight:400;font-size:34px;line-height:42px">A little closer to<br>your soulmate story.</h1><p style="margin:18px 0 0;color:#e1d5df;font-size:15px;line-height:24px">Your order is confirmed, ${escape(s.customerName)}.</p></td></tr>
<tr><td style="padding:30px 32px 12px"><p style="margin:0;font-size:15px;line-height:25px">Thank you for choosing AstroRekha. We’re excited to bring your personal soulmate portrait to life. Here’s everything included in your order.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:22px;background:#faf5ed;border-left:3px solid #cba368"><tr><td style="padding:18px 20px"><p style="margin:0 0 10px;font-weight:700;font-size:14px">Made just for you</p>${features(s).map((feature) => `<p style="margin:7px 0;font-size:13px;line-height:21px">✓ &nbsp; ${escape(feature)}</p>`).join("")}</td></tr></table>
<h2 style="margin:28px 0 4px;font-family:Georgia,serif;font-size:24px;font-weight:400">Your order summary</h2><table width="100%" cellspacing="0" cellpadding="0" aria-label="Order summary">${lines}${totalRow("Subtotal", s.subtotal)}${totalRow("GST (18%)", s.gst)}${totalRow(s.paidAt ? "Total paid" : "Order total", s.total, true)}</table>
<p style="margin:22px 0 0;padding:16px 0;border-top:1px solid #e8dfe2;font-size:12px;color:#776b76;line-height:21px">Invoice <strong>${escape(invoice.invoice_number)}</strong> &nbsp; · &nbsp; ${escape(date(invoice.issued_at))}${s.orderId ? `<br>Order reference: ${escape(s.orderId)}` : ""}<br>Your PDF invoice is attached for your records.</p></td></tr>
<tr><td style="padding:14px 32px 32px"><h2 style="font-family:Georgia,serif;font-weight:400;font-size:23px;margin:0 0 12px">What happens next?</h2><p style="margin:0;font-size:14px;line-height:24px">We’ll prepare your sketch${s.entitlements.description || s.entitlements.timeline ? " and written reports" : ""} using the preferences you shared. Your completed order will arrive by email <strong>within ${s.entitlements.promised_hours} hours of payment confirmation</strong>.</p><p style="margin:18px 0 0;font-size:14px;line-height:24px">With warmth,<br><strong>Team AstroRekha</strong></p></td></tr>
<tr><td style="padding:22px 32px;background:#fbf8f6;border-top:1px solid #e8dfe2;text-align:center;font-size:12px;line-height:21px;color:#776b76">Questions about your order? <a href="mailto:team.astrorekha@gmail.com" style="color:#9d3259">We’re here to help.</a><br><a href="https://astrorekha.com" style="color:#776b76;text-decoration:none">astrorekha.com</a><br><span style="font-size:10px">Created for personal reflection and entertainment.</span></td></tr>
</table></td></tr></table></body></html>`;
  return { subject: "Your AstroRekha order is confirmed ✨", html, text: `Your order is confirmed, ${s.customerName}.\n\n${s.items.map((item) => `${soulmateReceiptItemName(item)}: INR ${amount(item.amount_paise)}`).join("\n")}\nSubtotal: INR ${amount(s.subtotal)}\nGST (18%): INR ${amount(s.gst)}\n${s.paidAt ? "Total paid" : "Order total"}: INR ${amount(s.total)}\nInvoice: ${invoice.invoice_number}\n\nYour PDF invoice is attached. Delivery within ${s.entitlements.promised_hours} hours of payment confirmation.\n\nWith warmth,\nTeam AstroRekha\nteam.astrorekha@gmail.com` };
}

export function generateSoulmateInvoicePdf(invoice: SoulmateInvoiceDocument): Buffer {
  const s = invoice.snapshot;
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.setCreationDate(new Date(invoice.issued_at));
  doc.setFileId(crypto.createHash("sha256").update(invoice.invoice_number).digest("hex").slice(0,32));
  doc.setProperties({ title: `AstroRekha Invoice ${invoice.invoice_number}`, author: "AstroRekha", subject: "Soulmate order summary and invoice" });
  const text = (value: string, x: number, y: number, size = 10, bold = false, colour = "#332633") => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(colour); doc.text(value, x, y); };
  doc.setFillColor("#211321"); doc.rect(0, 0, 210, 52, "F");
  text("A S T R O R E K H A", 18, 19, 12, true, "#d8b779");
  doc.setFont("times", "normal"); doc.setFontSize(29); doc.setTextColor("#ffffff"); doc.text("Soulmate Sketch", 18, 36);
  text("ORDER INVOICE", 18, 66, 9, true, "#9d3259");
  text(invoice.invoice_number, 18, 77, 17, true);
  text(`Issued ${date(invoice.issued_at)}`, 140, 67, 10);
  if (s.paidAt) text(`Paid ${date(s.paidAt)}`, 140, 76, 10);
  doc.setDrawColor("#e8dfe2"); doc.line(18, 86, 192, 86);
  text("BILLED TO", 18, 99, 8, true, "#776b76");
  text(/^[\x20-\x7E]+$/.test(s.customerName) ? s.customerName : "Customer", 18, 108, 12, true);
  doc.setFontSize(9); const emailLines = doc.splitTextToSize(s.customerEmail, 96); doc.text(emailLines, 18, 116);
  text("ISSUED BY", 130, 99, 8, true, "#776b76"); text("AstroRekha", 130, 108, 12, true);
  let y = Math.max(139, 120 + emailLines.length * 4);
  doc.setFillColor("#f6f1ef"); doc.rect(18, y-7, 174, 12, "F"); text("ITEM", 22, y, 8, true); text("AMOUNT (INR)", 158, y, 8, true); y += 15;
  for (const item of s.items) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    const name = soulmateReceiptItemName(item).replaceAll("₹", "INR ").replace(/[^\x20-\x7E]/g, "-");
    const lines = doc.splitTextToSize(name, 120); doc.setTextColor("#332633"); doc.text(lines, 22, y);
    doc.text(amount(item.amount_paise), 188, y, { align: "right" }); y += Math.max(14, lines.length * 5 + 7); doc.setDrawColor("#e8dfe2"); doc.line(18, y-5, 192, y-5);
  }
  if (y + 36 > 260) {
    doc.addPage(); text("ASTROREKHA", 18, 22, 12, true, "#9d3259"); text(invoice.invoice_number, 130, 22, 10); y = 48;
  }
  for (const [label, value] of [["Subtotal", s.subtotal], ["GST (18%)", s.gst]] as const) { text(label, 121, y+3, 10); doc.text(amount(value), 188, y+3, { align: "right" }); y += 9; }
  doc.setFillColor("#f6f1ef"); doc.roundedRect(115, y-2, 77, 16, 2, 2, "F"); text(s.paidAt ? "TOTAL PAID" : "ORDER TOTAL", 121, y+8, 9, true); doc.setFontSize(13); doc.text(amount(s.total), 188, y+8, { align: "right" }); y += 27;
  if (s.orderId) text(`Order reference: ${s.orderId}`, 18, 265, 8, false, "#776b76");
  doc.setDrawColor("#e8dfe2"); doc.line(18, 273, 192, 273); text("Thank you for choosing AstroRekha.", 18, 281, 9); text("Digital products | INR", 153, 281, 8, false, "#776b76");
  return Buffer.from(doc.output("arraybuffer"));
}

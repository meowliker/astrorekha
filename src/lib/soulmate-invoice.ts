import crypto from "crypto";
import { getSupabaseAdmin } from "./supabase-admin";
import { generateSoulmateInvoicePdf, soulmateConfirmationEmail, type SoulmateInvoiceDocument } from "./soulmate-invoice-template";
const TABLE = "soulmate_order_invoices";
const BUCKET = "soulmate-sketches-private";
export type SoulmateInvoice = SoulmateInvoiceDocument & { id: string; order_id: string | null; source: "purchase" | "manual_preview"; storage_path: string | null; pdf_sha256: string | null; status: string; processing_token: string | null; provider_message_id: string | null; sent_at: string | null; last_error: string | null };

export async function readSoulmateInvoice(id: string): Promise<SoulmateInvoice> {
  const result = await getSupabaseAdmin().from(TABLE).select("*").eq("id",id).single();
  if (result.error || !result.data) throw new Error("Invoice unavailable");
  return result.data;
}
export async function invoicePdf(invoice: SoulmateInvoice) {
  if (!invoice.storage_path || !invoice.pdf_sha256) throw new Error("Invoice PDF is not ready");
  const result = await getSupabaseAdmin().storage.from(BUCKET).download(invoice.storage_path);
  if (result.error || !result.data) throw new Error("Invoice file unavailable");
  const pdf = Buffer.from(await result.data.arrayBuffer());
  if (crypto.createHash("sha256").update(pdf).digest("hex") !== invoice.pdf_sha256) throw new Error("Invoice integrity check failed");
  return pdf;
}
/** Save first, then send. Invoice numbers and bytes remain unchanged on retries. */
export async function prepareSoulmateInvoice(id: string) {
  const db = getSupabaseAdmin();
  let invoice = await readSoulmateInvoice(id);
  if (invoice.storage_path) return invoice;
  const token = crypto.randomUUID();
  const claim = await db.from(TABLE).update({ status:"preparing",processing_token:token,lease_until:new Date(Date.now()+120000).toISOString() }).eq("id",id)
    .or(`status.eq.pending,and(status.eq.preparing,lease_until.lt.${new Date().toISOString()})`).select("*").maybeSingle();
  if (claim.error || !claim.data) return null;
  invoice = claim.data;
  try {
    const pdf = generateSoulmateInvoicePdf(invoice);
    const path = `${invoice.order_id || `confirmation-${invoice.id}`}/${invoice.invoice_number}.pdf`;
    const uploaded = await db.storage.from(BUCKET).upload(path,pdf,{contentType:"application/pdf",upsert:false});
    let storedPdf = pdf;
    if (uploaded.error) {
      // A previous process may have saved the file and stopped before recording its path.
      const existing = await db.storage.from(BUCKET).download(path);
      if (existing.error || !existing.data) throw new Error("Unable to save invoice PDF");
      storedPdf = Buffer.from(await existing.data.arrayBuffer());
      if (!storedPdf.subarray(0,5).equals(Buffer.from("%PDF-"))) throw new Error("Invalid stored invoice");
    }
    const saved = await db.from(TABLE).update({storage_path:path,pdf_sha256:crypto.createHash("sha256").update(storedPdf).digest("hex"),status:"pending",processing_token:null,lease_until:null,last_error:null}).eq("id",id).eq("processing_token",token).select("*").maybeSingle();
    if (saved.error || !saved.data) throw new Error("Unable to register invoice PDF");
    return saved.data as SoulmateInvoice;
  } catch (cause) {
    await db.from(TABLE).update({status:"pending",processing_token:null,lease_until:null,last_error:"Invoice preparation failed; will retry"}).eq("id",id).eq("processing_token",token);
    throw cause;
  }
}
export async function sendSoulmateConfirmation(id: string) {
  const key=process.env.BREVO_API_KEY;
  if (!key) throw new Error("Email provider not configured");
  const db=getSupabaseAdmin();
  const invoice=await prepareSoulmateInvoice(id);
  if (!invoice || invoice.status!=="pending") return invoice;
  const pdf=await invoicePdf(invoice);
  const email=soulmateConfirmationEmail(invoice);
  const claim=await db.from(TABLE).update({status:"submitting",submitted_at:new Date().toISOString(),last_error:null}).eq("id",id).eq("status","pending").select("id").maybeSingle();
  if (claim.error) throw new Error("Unable to claim confirmation");
  if (!claim.data) return invoice;
  try {
    const response=await fetch("https://api.brevo.com/v3/smtp/email",{method:"POST",headers:{"api-key":key,"Content-Type":"application/json"},signal:AbortSignal.timeout(15000),body:JSON.stringify({
      sender:{email:process.env.BREVO_SENDER_EMAIL||"team@astrorekha.com",name:"Astro Rekha"},
      to:[{email:invoice.snapshot.customerEmail,name:invoice.snapshot.customerName}],
      subject:email.subject,htmlContent:email.html,textContent:email.text,
      attachment:[{name:`${invoice.invoice_number}.pdf`,content:pdf.toString("base64")}],
      headers:{idempotencyKey:invoice.id},tags:["soulmate_confirmation",invoice.id],
    })});
    const payload=await response.json();
    if (!response.ok || !payload.messageId) throw new Error("Confirmation submission was not acknowledged");
    const saved=await db.from(TABLE).update({status:"sent",sent_at:new Date().toISOString(),provider_message_id:payload.messageId}).eq("id",id).eq("status","submitting");
    if(saved.error)throw new Error("Unable to save confirmation acknowledgement");
    return await readSoulmateInvoice(id);
  } catch(cause) {
    // A timeout may still have sent the email. Never automatically send a second copy.
    await db.from(TABLE).update({status:"needs_review",last_error:"Confirmation outcome uncertain; check Brevo using invoice ID before retrying"}).eq("id",id).eq("status","submitting");
    throw cause;
  }
}
/** Called only after PayU verification; failures must not change payment success. */
export async function confirmSoulmatePurchase(order: {id:string;payment_status:string;catalog_version?:number}) {
  if(order.payment_status!=="paid" || order.catalog_version!==2)return;
  try {
    const result=await getSupabaseAdmin().rpc("ensure_soulmate_invoice",{p_order:order.id});
    if(result.error || !result.data)throw new Error("Invoice queue unavailable");
    await sendSoulmateConfirmation(result.data);
  } catch { console.warn("[soulmate-invoice] Confirmation awaits retry or review",{orderId:order.id}); }
}
export async function retrySoulmateConfirmations() {
  const db=getSupabaseAdmin();
  await db.from(TABLE).update({status:"needs_review",last_error:"Confirmation was interrupted; check Brevo before retrying"}).eq("status","submitting").lt("submitted_at",new Date(Date.now()-5*60000).toISOString());
  const result=await db.from(TABLE).select("id").eq("source","purchase").in("status",["pending","preparing"]).order("issued_at").limit(3);
  if(result.error)throw new Error("Invoice queue unavailable");
  const settled=await Promise.allSettled(result.data.map((row)=>sendSoulmateConfirmation(row.id)));
  return {processed:settled.length,failures:settled.filter((row)=>row.status==="rejected").length};
}

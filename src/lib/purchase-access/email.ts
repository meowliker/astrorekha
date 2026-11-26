import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { hashSecret, purchaseCode } from './security';
import { generateOrderInvoicePdf, type OrderInvoice } from '@/lib/order-invoice';
import { purchaseInvoice } from './invoice';
export type AccessEmail = {
    id: string;
    source: 'IN' | 'US';
    order_id: string;
    user_id: string;
    email: string;
    amount_minor: number;
    currency: 'INR' | 'USD';
    code_nonce: string;
    code_hash: string | null;
    first_attempt_at: string;
    invoice_snapshot?: OrderInvoice | null;
};
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function renderPurchaseAccessEmail(row: AccessEmail, code: string, invoice: OrderInvoice) {
    const money=(amount:number)=>escape(new Intl.NumberFormat('en-IN',{style:'currency',currency:invoice.currency}).format(amount));
    const items=invoice.items.map(item=>`<tr><td style="padding:8px 0;color:#D1D5DB">${escape(item.name)}</td><td align="right" style="padding:8px 0;color:#fff">${money(item.amount)}</td></tr>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body bgcolor="#0f0a1a" style="margin:0;padding:0;background-color:#0f0a1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#0f0a1a"><tr><td align="center" style="padding:40px 20px">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px">
<tr><td align="center" style="padding-bottom:32px"><h1 style="color:#fff;font-size:28px;margin:0;font-weight:600">✨ AstroRekha</h1><p style="color:#9CA3AF;font-size:14px;margin:8px 0 0">Your Cosmic Journey Awaits</p></td></tr>
<tr><td bgcolor="#1a1525" style="border-radius:16px;padding:32px;border:1px solid #2d2640">
<h2 style="color:#c4b5fd;font-size:22px;margin:0 0 12px;text-align:center">Your order is confirmed</h2>
<p style="color:#D1D5DB;font-size:14px;line-height:1.7">Namaste 🙏<br>Thank you for your purchase. Your invoice is attached, and your purchase is available in your AstroRekha account.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">${items}<tr><td style="padding-top:12px;border-top:1px solid #2d2640;color:#fff"><strong>Total paid</strong></td><td align="right" style="padding-top:12px;border-top:1px solid #2d2640;color:#fff"><strong>${money(invoice.total)}</strong></td></tr></table>
<p style="color:#9CA3AF;font-size:12px;line-height:1.6">Invoice: ${escape(invoice.invoiceNumber)}<br>Order: ${escape(row.order_id)}</p>
<h3 style="color:#c4b5fd;font-size:18px;text-align:center;margin:28px 0 8px">Your one-time sign-in code</h3>
<p style="color:#9CA3AF;font-size:14px;line-height:1.7;text-align:center">On the login page, enter <strong style="color:#D1D5DB">${escape(row.email)}</strong> in the email field and the code below in the <strong style="color:#D1D5DB">password field</strong>.</p>
<table align="center" cellpadding="0" cellspacing="0" bgcolor="#251d35" style="border:2px solid #A855F7;border-radius:12px"><tr><td align="center" style="padding:20px 16px"><span style="font-size:28px;font-weight:bold;color:#A855F7;letter-spacing:4px;font-family:'Courier New',monospace">${escape(code)}</span></td></tr></table>
<p style="color:#9CA3AF;font-size:13px;line-height:1.7;text-align:center">After signing in, choose a new password—no old password needed—or go directly to your reports.</p>
<p style="text-align:center;margin:24px 0"><a href="https://astrorekha.com/login" style="background:#9333EA;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;display:inline-block;font-weight:600">Open AstroRekha</a></p>
<p style="color:#9CA3AF;font-size:12px;line-height:1.7;text-align:center">This code has no expiry and works only once. Keep it private. After using it, sign in with your password or request a fresh sign-in code.</p>
<p style="color:#9CA3AF;font-size:13px;line-height:1.7;margin-top:24px">Need help? <a href="mailto:team.astrorekha@gmail.com" style="color:#c4b5fd">team.astrorekha@gmail.com</a><br>With gratitude,<br>Team AstroRekha</p>
<p style="color:#9CA3AF;font-size:12px;line-height:1.6;margin-top:16px">This is a digital product. Access your purchased reports by signing in to your AstroRekha account at astrorekha.com/login. No physical product will be shipped or delivered.</p>
</td></tr><tr><td align="center" style="padding-top:32px;color:#6B7280;font-size:12px">© ${new Date().getFullYear()} AstroRekha. All rights reserved.</td></tr>
</table></td></tr></table></body></html>`;
}
export async function deliverAccessEmail(row: AccessEmail, html: string, attachment: {name:string;content:string}): Promise<{
    status: 'sent' | 'retry' | 'failed';
    messageId?: string;
    reason?: string;
}> {
    if (!process.env.BREVO_API_KEY)
        return { status: 'retry', reason: 'email_not_configured' };
    try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ sender: { email: process.env.BREVO_SENDER_EMAIL || 'team@astrorekha.com', name: process.env.BREVO_SENDER_NAME || 'AstroRekha' }, to: [{ email: row.email }], subject: 'Your AstroRekha order confirmation & invoice', htmlContent: html, attachment:[attachment], headers: { idempotencyKey: row.id } }) });
        const data = await response.json().catch(() => ({}));
        if (response.ok)
            return { status: 'sent', messageId: typeof data.messageId === 'string' ? data.messageId : undefined };
        if (data.code === 'duplicate_parameter' && typeof data.message === 'string' && /idempotency/i.test(data.message))
            return { status: 'sent' };
        return { status: response.status === 429 || response.status >= 500 ? 'retry' : 'failed', reason: `provider_${response.status}` };
    }
    catch {
        return { status: 'retry', reason: 'delivery_not_confirmed' };
    }
}
export async function sendPurchaseAccessEmails() {
    // Local and preview builds must never email production customers.
    if (process.env.VERCEL_ENV !== 'production')
        return { skipped: true };
    const db = getSupabaseAdmin();
    const queued = await db.rpc('enqueue_purchase_access_emails');
    if (queued.error)
        throw new Error('Recovery queue unavailable');
    const claim = randomUUID();
    const claimed = await db.rpc('claim_purchase_access_emails', { p_claim: claim, p_limit: 5 });
    if (claimed.error)
        throw new Error('Recovery queue unavailable');
    const results = await Promise.all(((claimed.data || []) as AccessEmail[]).map(async (row) => {
        try {
            const code = purchaseCode(row.id, row.code_nonce), hash = hashSecret(code);
            if (row.code_hash && row.code_hash !== hash)
                throw new Error('recovery_key_changed');
            const invoice = await purchaseInvoice(row);
            const prepared = await db.from('purchase_access_emails').update({ code_hash: hash, invoice_snapshot: invoice }).eq('id', row.id).eq('claim_id', claim).eq('status', 'sending').select('id').maybeSingle();
            if (prepared.error || !prepared.data)
                throw new Error('recovery_prepare_failed');
            const result = await deliverAccessEmail(row, renderPurchaseAccessEmail(row, code, invoice), {name:`${invoice.invoiceNumber}.pdf`,content:generateOrderInvoicePdf(invoice).toString("base64")});
            const saved = await db.from('purchase_access_emails').update({ status: result.status, last_error: result.reason || null, provider_message_id: result.messageId || null, ...(result.status === 'sent' ? { sent_at: new Date().toISOString() } : { next_attempt_at: new Date(Date.now() + 120000).toISOString() }) }).eq('id', row.id).eq('claim_id', claim);
            if (saved.error)
                throw new Error('recovery_delivery_stamp_failed');
            return result.status;
        }
        catch {
            return 'needs_review';
        } // Keep the lease: a later run safely handles its bounded retry window.
    }));
    return { queued: queued.data || 0, processed: results.length, sent: results.filter(x => x === 'sent').length, retry: results.filter(x => x === 'retry').length, attention: results.filter(x => x === 'failed' || x === 'needs_review').length };
}

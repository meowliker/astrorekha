import type { SoulmateEntitlements } from "./us-soulmate-cart";

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function soulmateDeliveryTemplate(order: { id: string; customer_name: string; entitlements?: SoulmateEntitlements }) {
  const items = [
    { name: order.entitlements?.sketch === "colour" ? "Your colour soulmate sketch" : "Your black & white soulmate sketch", detail: "A personal portrait inspired by the preferences you shared." },
    ...(order.entitlements?.description ? [{ name: "Your soulmate description", detail: "An exploration of personality, connection and possible meeting moments." }] : []),
    ...(order.entitlements?.timeline ? [{ name: "Your Soulmate Connection Timeline", detail: "A look at possible milestones and how your connection might unfold." }] : []),
  ];
  const name = order.customer_name || "there";
  const titles = ["your soulmate sketch", ...(order.entitlements?.description ? ["your soulmate description"] : []), ...(order.entitlements?.timeline ? ["your Soulmate Connection Timeline"] : [])];
  const joined = titles.length === 1 ? titles[0] : `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
  const named = joined[0].toUpperCase() + joined.slice(1);
  const subject = `${named} ${items.length > 1 ? "are" : "is"} here ✨`;
  const intro = `${named} ${items.length > 1 ? "are" : "is"} ready. You’ll find ${items.length > 1 ? "them" : "it"} attached to this email.`;
  const quote = "Every new story begins with a little possibility.";
  const html = `<!doctype html><html><body style="margin:0;background:#f5f1ed;color:#302732;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#fff;border:1px solid #e6ded8"><tr><td style="padding:40px 36px;background:#241426"><div style="color:#d8b86d;font-size:12px;font-weight:bold;letter-spacing:4px">ASTROREKHA</div><h1 style="font-family:Georgia,serif;font-weight:normal;font-size:36px;line-height:1.2;color:#fff;margin:24px 0 8px">Your soulmate sketch is here.</h1><p style="color:#d8cbd7;font-size:15px;line-height:1.7;margin:0">A little possibility, made personal.</p></td></tr><tr><td style="padding:34px 36px"><p style="font-size:17px;margin:0 0 18px">Hello ${escape(name)},</p><p style="font-size:15px;line-height:1.8;margin:0 0 28px">${intro}</p><h2 style="font-size:12px;letter-spacing:2px;color:#9b6e37;margin:0 0 18px">ATTACHED FOR YOU</h2>${items.map(item => `<div style="padding:16px 18px;margin:0 0 10px;background:#f7f3f0;border:1px solid #ebe2dc"><div style="font-size:16px;font-weight:bold;margin-bottom:7px">${escape(item.name)}</div><div style="font-size:14px;color:#766c76;line-height:1.6">${escape(item.detail)}</div></div>`).join("")}<p style="font-family:Georgia,serif;font-size:21px;line-height:1.5;color:#8e6538;text-align:center;margin:30px 0">“${quote}”</p><p style="font-size:15px;line-height:1.8;margin-bottom:0">With warmth,<br><strong>Astro Rekha</strong></p></td></tr><tr><td style="padding:22px 36px;background:#f7f3f0;border-top:1px solid #e6ded8;font-size:12px;color:#766c76;line-height:1.8">Need a hand? Write to <a href="mailto:team.astrorekha@gmail.com" style="color:#8b4561">team.astrorekha@gmail.com</a><br>Order reference: ${escape(order.id)}</td></tr></table></td></tr></table></body></html>`;
  const text = `Hello ${name},\n\n${intro}\n\nATTACHED FOR YOU\n${items.map(item => `${item.name}\n${item.detail}`).join("\n\n")}\n\n“${quote}”\n\nWith warmth,\nAstro Rekha\n\nNeed a hand? team.astrorekha@gmail.com\nOrder reference: ${order.id}`;
  return { subject, htmlContent: html, textContent: text, replyTo: { email: "team.astrorekha@gmail.com", name: "Astro Rekha" } };
}

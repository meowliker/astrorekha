import { sendEmail, sendEmailWithAttachments } from "@/lib/brevo";
import { ASTROREKHA_ASSETS } from "@/lib/assets";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const VASTU_GUIDE_BUCKET = process.env.VASTU_GUIDE_BUCKET || "digital-products";
const VASTU_GUIDE_PATH =
  process.env.VASTU_GUIDE_PATH || "vastu/complete-vastu-shastra-guide.pdf";
const VASTU_GUIDE_FILE_NAME =
  process.env.VASTU_GUIDE_FILE_NAME || "Complete-Vastu-Shastra-Guide.pdf";
const VASTU_GUIDE_MAX_ATTACHMENT_BYTES = Number(
  process.env.VASTU_GUIDE_MAX_ATTACHMENT_BYTES || 4 * 1024 * 1024
);
const VASTU_GUIDE_LINK_EXPIRES_SECONDS = Number(
  process.env.VASTU_GUIDE_LINK_EXPIRES_SECONDS || 60 * 24 * 60 * 60
);
const configuredAppUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
const APP_URL =
  configuredAppUrl && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(configuredAppUrl)
    ? configuredAppUrl
    : "https://astrorekha.com";
const ASTROREKHA_LOGO_URL = ASTROREKHA_ASSETS.logo.startsWith("http")
  ? ASTROREKHA_ASSETS.logo
  : `${APP_URL}${ASTROREKHA_ASSETS.logo}`;

function buildVastuGuideEmailHtml(name?: string, downloadUrl?: string | null): string {
  const firstName = (name || "there").trim().split(/\s+/)[0] || "there";
  const deliveryCopy = downloadUrl
    ? "Your Complete Vastu Shastra Guide Ebook is ready. Use the button below to download your PDF."
    : "Your Complete Vastu Shastra Guide Ebook is attached to this email.";
  const helpCopy = downloadUrl
    ? "If the download button does not work, contact us on: team.astrorekha@gmail.com"
    : "If the attachment does not appear, contact us on: team.astrorekha@gmail.com";

  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#090b14;font-family:Inter,Arial,sans-serif;color:#f8fafc;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#090b14;padding:28px 14px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#121827;border:1px solid rgba(255,255,255,0.12);border-radius:24px;overflow:hidden;">
            <tr>
              <td style="padding:34px 28px 22px;text-align:center;background:linear-gradient(135deg,#1f2937 0%,#111827 58%,#2b1837 100%);">
                <img src="${ASTROREKHA_LOGO_URL}" alt="AstroRekha" width="88" height="88" style="display:block;width:88px;height:88px;margin:0 auto 18px;border-radius:999px;border:1px solid rgba(233,201,152,0.55);object-fit:cover;" />
                <h1 style="margin:0;color:#ffffff;font-size:28px;line-height:1.18;font-weight:800;">Your Vastu Shastra Guide is ready</h1>
                <p style="margin:14px 0 0;color:#cbd5e1;font-size:15px;line-height:1.6;">Hi ${firstName}, ${deliveryCopy}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 28px;">
                <div style="background:#1a2235;border:1px solid rgba(255,255,255,0.10);border-radius:18px;padding:20px;">
                  <h2 style="margin:0 0 12px;color:#ffffff;font-size:18px;">Inside the guide</h2>
                  <p style="margin:0;color:#aab3c5;font-size:14px;line-height:1.7;">Use this 150+ page PDF to understand home directions, entrances, room placement, remedies, office setup, and practical Vastu principles for everyday spaces.</p>
                </div>
                ${
                  downloadUrl
                    ? `<div style="text-align:center;margin-top:24px;">
                        <a href="${downloadUrl}" style="display:inline-block;background:#e91e53;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 24px;border-radius:14px;">Download Vastu Guide</a>
                      </div>`
                    : ""
                }
                <p style="margin:22px 0 0;color:#94a3b8;font-size:13px;line-height:1.7;text-align:center;">${helpCopy}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 28px;text-align:center;color:#64748b;font-size:12px;">
                VisionaryEra
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function createVastuGuideDownloadUrl(): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(VASTU_GUIDE_BUCKET)
    .createSignedUrl(VASTU_GUIDE_PATH, VASTU_GUIDE_LINK_EXPIRES_SECONDS, {
      download: VASTU_GUIDE_FILE_NAME,
    });

  if (error || !data?.signedUrl) {
    console.error("[VastuGuideEmail] signed URL failed:", {
      bucket: VASTU_GUIDE_BUCKET,
      path: VASTU_GUIDE_PATH,
      error: error?.message || error,
    });
    return null;
  }

  return data.signedUrl;
}

async function getVastuGuideAttachment(): Promise<{ name: string; content: string } | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(VASTU_GUIDE_BUCKET)
    .download(VASTU_GUIDE_PATH);

  if (error || !data) {
    console.error("[VastuGuideEmail] PDF download failed:", {
      bucket: VASTU_GUIDE_BUCKET,
      path: VASTU_GUIDE_PATH,
      error: error?.message || error,
    });
    return null;
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  if (buffer.length > VASTU_GUIDE_MAX_ATTACHMENT_BYTES) {
    return null;
  }

  return {
    name: VASTU_GUIDE_FILE_NAME,
    content: buffer.toString("base64"),
  };
}

export async function sendVastuGuideEmail({
  email,
  name,
}: {
  email?: string | null;
  name?: string | null;
}): Promise<boolean> {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) return false;

  const attachment = await getVastuGuideAttachment();
  if (!attachment) {
    const downloadUrl = await createVastuGuideDownloadUrl();
    if (!downloadUrl) return false;

    await sendEmail(
      { email: normalizedEmail, name: name || undefined },
      "Your Complete Vastu Shastra Guide Ebook",
      buildVastuGuideEmailHtml(name || undefined, downloadUrl)
    );

    return true;
  }

  await sendEmailWithAttachments(
    { email: normalizedEmail, name: name || undefined },
    "Your Complete Vastu Shastra Guide Ebook",
    buildVastuGuideEmailHtml(name || undefined),
    [attachment]
  );

  return true;
}

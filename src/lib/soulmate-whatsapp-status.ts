export type SoulmateWhatsAppMessage = {
  kind: "invoice" | "sketch" | "description" | "timeline";
  status: "submitting" | "accepted" | "needs_review";
  submitted_at: string | null; accepted_at: string | null; last_error: string | null;
};

export function soulmateWhatsAppStatus(message: SoulmateWhatsAppMessage | undefined,
  eligible: boolean, approved: boolean, scheduledAt: string | null, kind: string, now = Date.now()) {
  if (message?.status === "accepted") return "Accepted by AiSensy";
  if (message?.status === "needs_review") return "Needs review";
  if (message?.status === "submitting") return message.submitted_at && now - Date.parse(message.submitted_at) > 120000
    ? "Submission unconfirmed — check AiSensy" : "Submitting";
  if (!eligible) return "Not enrolled for automatic WhatsApp";
  if (kind === "invoice") return "Queued after payment";
  if (!approved) return "Awaiting report preparation";
  return scheduledAt && Date.parse(scheduledAt) > now ? "Scheduled" : "Queued for delivery";
}

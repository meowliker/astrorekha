import crypto from "crypto";
import { getSupabaseAdmin } from "./supabase-admin";
import { sanitizeAnswers, type Answers } from "@/app/soulmate/chat-data";

export type SessionCredentials = { id: string; token: string; revision: number };
export function sessionCredentials(value: unknown): SessionCredentials | null {
  const v = value as SessionCredentials | null;
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
  return v && uuid.test(v.id) && uuid.test(v.token) && Number.isSafeInteger(v.revision) && v.revision >= 0 && v.revision < 100000 ? v : null;
}
export async function saveSoulmateSession(credentials: SessionCredentials, answers: Answers) {
  const { data, error } = await getSupabaseAdmin().rpc("save_soulmate_session", {
    p_id: credentials.id, p_token_hash: crypto.createHash("sha256").update(credentials.token).digest("hex"),
    p_answers: sanitizeAnswers(answers), p_revision: credentials.revision,
  });
  if (error || data !== true) throw new Error("Unable to save sketch answers");
}

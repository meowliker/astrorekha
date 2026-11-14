// Optional browser hints must never make a successful cookie login fail.
export function readSessionHint(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function writeSessionHint(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* Use the signed session. */ }
}
export function removeSessionHint(key: string) {
  try { localStorage.removeItem(key); } catch { /* Storage can be disabled. */ }
}

export function saveLoginUserId(userId: string) {
  const previousId = readSessionHint("astrorekha_user_id");
  // Keep drafts with their original account when switching logins.
  if (previousId && previousId !== userId) {
    const answers = readSessionHint("astrorekha_soulmate_answers");
    if (answers) writeSessionHint(`astrorekha_soulmate_answers:${previousId}`, answers);
    removeSessionHint("astrorekha_soulmate_answers");
  }
  writeSessionHint("astrorekha_user_id", userId);
}

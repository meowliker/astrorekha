// Optional browser hints must never make a successful cookie login fail.
const memoryHints = new Map<string, string | null>();
export function readSessionHint(key: string): string | null {
  if(memoryHints.has(key)) return memoryHints.get(key) ?? null;
  try { return localStorage.getItem(key); } catch { return memoryHints.get(key) ?? null; }
}
export function writeSessionHint(key: string, value: string) {
  memoryHints.set(key, value);
  try { localStorage.setItem(key, value); memoryHints.delete(key); } catch { /* Use the signed session. */ }
}
export function removeSessionHint(key: string) {
  memoryHints.set(key, null);
  try { localStorage.removeItem(key); memoryHints.delete(key); } catch { /* Storage can be disabled. */ }
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

export function clearSessionHints() {
  memoryHints.clear();
  try { localStorage.clear(); } catch { /* Optional storage. */ }
}

export const sessionHints = { getItem: readSessionHint, setItem: writeSessionHint, removeItem: removeSessionHint, clear: clearSessionHints };

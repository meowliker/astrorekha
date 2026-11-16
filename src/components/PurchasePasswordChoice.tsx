"use client";
import { useEffect, useRef, useState } from "react";
import { clearCustomerSessionCache } from "@/lib/session-recovery";
export function PurchasePasswordChoice() {
  const [editing,setEditing]=useState(false),[password,setPassword]=useState(""),[confirmation,setConfirmation]=useState("");
  const [error,setError]=useState(""),[busy,setBusy]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{dialog.current?.showModal();dialog.current?.focus();},[]);
    async function finish(changePassword: boolean) {
        if (busy)
            return;
        setBusy(true);
        setError('');
        try {
            const r = await fetch(`/api/auth/purchase-access/${changePassword ? 'password' : 'skip'}`, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify(changePassword ? { newPassword: password, confirmPassword: confirmation } : {}) });
            const data = await r.json();
            if (!r.ok && !(r.status === 409 && !changePassword))
                throw Error(data.error || 'Unable to save your choice.');
            clearCustomerSessionCache();
            setPassword('');
            setConfirmation('');
            window.location.assign('/reports');
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Please retry.');
        }
        finally {
            setBusy(false);
        }
    }
    const input = 'w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white';
    const primary = 'w-full rounded-xl bg-gradient-to-r from-[#e9164b] to-[#9236ed] px-4 py-3 font-semibold text-white disabled:opacity-50';
  return (  <dialog onCancel={e => e.preventDefault()} aria-modal="true" aria-labelledby="password-choice-title" tabIndex={-1} ref={dialog} className="w-full max-w-md rounded-2xl border border-white/15 bg-[#151b2c] text-white p-6 space-y-5 outline-none backdrop:bg-black/75">
    <h2 id="password-choice-title" className="text-2xl font-semibold">{editing ? 'Set your new password' : 'You’re signed in'}</h2>
    <p className="text-white/65">{editing ? 'Enter a new password below. You don’t need your old password.' : 'Set or reset your password now, or go straight to your purchased reports.'}</p>
    {editing ? <form className="space-y-4" onSubmit={e => { e.preventDefault(); void finish(true); }}>
     <label className="block space-y-2"><span>New password</span><input type="password" autoComplete="new-password" className={input} required minLength={8} maxLength={72} value={password} onChange={e => setPassword(e.target.value)}/></label>
     <label className="block space-y-2"><span>Confirm new password</span><input type="password" autoComplete="new-password" className={input} required minLength={8} maxLength={72} value={confirmation} onChange={e => setConfirmation(e.target.value)}/></label>
     <button className={primary} disabled={busy}>{busy ? 'Saving…' : 'Save password and open reports'}</button>
    </form> : <button className={primary} disabled={busy} onClick={() => { setError(''); setEditing(true); }}>Set / reset password</button>}
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    <button className="w-full rounded-xl border border-white/20 py-3 disabled:opacity-50" disabled={busy} onClick={() => void finish(false)}>Go directly to reports</button>
  </dialog>);
}

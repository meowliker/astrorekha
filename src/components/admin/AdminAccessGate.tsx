"use client";

import {createContext, useContext, useEffect, useState, type ReactNode} from 'react';
import {usePathname, useRouter} from 'next/navigation';
import {canAccess, workspaceForPath, type AdminAccess} from '@/lib/admin-workspaces';

const Context = createContext<AdminAccess | null>(null);
export const useAdminAccess = () => useContext(Context);
const SESSION_CHECK_INTERVAL = 30_000;
const SESSION_CHECK_TIMEOUT = 8_000;

export default function AdminAccessGate({children}: {children: ReactNode}) {
  const path = usePathname();
  const router = useRouter();
  const isLogin = path === '/admin/login';
  const [access, setAccess] = useState<AdminAccess | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    setAccess(null);
    setError('');
    if (isLogin) return;

    let active = true;
    let pending = false;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const signIn = () => {
      setAccess(null);
      localStorage.removeItem('admin_session_token');
      localStorage.removeItem('admin_session_expiry');
      router.replace('/admin/login');
    };

    const load = async () => {
      if (!active || pending) return;
      clearTimeout(timer);
      pending = true;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let expired = false;
      let sessionChanged = false;
      try {
        const token = localStorage.getItem('admin_session_token');
        const savedExpiry = localStorage.getItem('admin_session_expiry');
        const expiresAt = savedExpiry ? Date.parse(savedExpiry) : NaN;
        // This only rejects expired credentials; it never grants access locally.
        if (!token || !/^[a-f0-9]{64}$/.test(token) || (Number.isFinite(expiresAt) && expiresAt <= Date.now())) {
          expired = true;
          signIn();
          return;
        }
        controller = new AbortController();
        timeout = setTimeout(() => controller?.abort(), SESSION_CHECK_TIMEOUT);
        const response = await fetch('/api/admin/session', {
          headers: {'x-admin-session': token},
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = await response.json();
        if (!active) return;
        // A reply for an old login must never sign out or authorize a new login.
        sessionChanged = localStorage.getItem('admin_session_token') !== token;
        if (sessionChanged) { setAccess(null); return; }
        if (response.status === 401) {
          expired = true;
          signIn();
          return;
        }
        if (!response.ok) throw new Error(data.error || 'Unable to check workspace access.');
        setAccess(data);
        setError('');
      } catch {
        if (active) {
          setError('We couldn’t check your access right now. Please try again.');
        }
      } finally {
        clearTimeout(timeout);
        pending = false;
        if (active && !expired) timer = setTimeout(() => void load(), sessionChanged ? 0 : SESSION_CHECK_INTERVAL);
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === 'admin_session_token' || event.key === 'admin_session_expiry') {
        // Clears the previous account's visible data immediately on cross-tab logout.
        setAccess(null);
        setRetry(value => value + 1);
      }
    };
    void load();
    window.addEventListener('storage', onStorage);
    return () => {
      active = false;
      clearTimeout(timer);
      controller?.abort();
      window.removeEventListener('storage', onStorage);
    };
    // The shared admin layout retains verified access during page navigation.
    // Each page is still checked against its workspace below, and every API
    // independently validates the session and current permissions on the server.
  }, [isLogin, router, retry]);

  if (isLogin) return <>{children}</>;
  if (error) return (
    <main className="p-8 text-white/70" role="alert">
      <p>{error}</p>
      <button className="mt-4 rounded-lg border border-white/20 px-4 py-2 text-white" onClick={() => setRetry(value => value + 1)}>Try again</button>
    </main>
  );
  if (!access) return <main className="p-8 text-white/60">Checking workspace access…</main>;
  if (!canAccess(access, workspaceForPath(path))) return (
    <main className="p-8 text-white"><p>You do not have access to this workspace.</p><a className="underline" href="/admin">Back to your workspaces</a></main>
  );
  return <Context.Provider value={access}>{children}</Context.Provider>;
}

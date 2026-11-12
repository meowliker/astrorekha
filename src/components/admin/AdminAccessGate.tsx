"use client";
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {usePathname,useRouter} from 'next/navigation';
import {canAccess,workspaceForPath,type AdminAccess} from '@/lib/admin-workspaces';
const Context=createContext<AdminAccess|null>(null);
export const useAdminAccess=()=>useContext(Context);
export default function AdminAccessGate({children}:{children:ReactNode}){
 const path=usePathname(),router=useRouter();const [access,setAccess]=useState<AdminAccess|null>(null),[error,setError]=useState(''),[checked,setChecked]=useState('');
 useEffect(()=>{if(path==='/admin/login')return;let active=true;const load=async()=>{try{const token=localStorage.getItem('admin_session_token');if(!token){router.replace('/admin/login');return;}const res=await fetch('/api/admin/session',{headers:{'x-admin-session':token},cache:'no-store'});const d=await res.json();if(res.status===401){router.replace('/admin/login');return;}if(!res.ok)throw new Error(d.error);if(active){setAccess(d);setError('');setChecked(path);}}catch(e){if(active)setError(e instanceof Error?e.message:'Unable to load access');}};void load();const timer=setInterval(load,30000);return()=>{active=false;clearInterval(timer);};},[path,router]);
 if(path==='/admin/login')return <>{children}</>;
 if(error)return <main className="p-8 text-red-300" role="alert">{error}</main>;
 if(!access||checked!==path)return <main className="p-8 text-white/60">Checking workspace access…</main>;
 if(!canAccess(access,workspaceForPath(path)))return <main className="p-8 text-white"><p>You do not have access to this workspace.</p><a className="underline" href="/admin">Back to your workspaces</a></main>;
 return <Context.Provider value={access}>{children}</Context.Provider>;
}

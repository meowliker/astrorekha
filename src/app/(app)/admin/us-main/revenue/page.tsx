"use client";
import Analytics from '@/components/admin/us-main/Analytics';
import {useState} from 'react';
import Link from 'next/link';
import RevenueDashboardTab from '@/components/admin/us-main/RevenueDashboardTab';
import {SoulmateWorkspaceShell} from '../workspace-shell';
import {SoulmateProfitPanel} from '../profit-panel';
export default function UsRevenue(){const [tab,setTab]=useState('Dashboard');return <SoulmateWorkspaceShell title="Revenue Dashboard" description="US AstroRekha sales, refunds, products and acquisition · USD"><nav className="flex flex-wrap gap-3 bg-white/5 p-3 rounded-xl my-6">{['Dashboard','Profit Sheet','Analytics'].map(t=><button key={t} onClick={()=>setTab(t)} className={`rounded-lg px-5 py-3 ${t===tab?'bg-primary':'text-white/60'}`}>{t}</button>)}<Link className="px-5 py-3" href="/admin/us-main/tracking">Meta Details ↗</Link></nav>{tab==='Profit Sheet'?<SoulmateProfitPanel/>:tab==='Analytics'?<Analytics/>:<RevenueDashboardTab/>}</SoulmateWorkspaceShell>;}

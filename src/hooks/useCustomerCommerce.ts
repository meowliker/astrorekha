'use client';
import {useEffect} from 'react';
import {create} from 'zustand';
import {useUserStore} from '@/lib/user-store';
import type {AccountProduct} from '@/lib/us-main/account-catalog';
type Data={userId:string;market:'IN'|'US';currency:'INR'|'USD';enabled:boolean;products:AccountProduct[]};
let flight:Promise<void>|null=null;
const useCommerce=create<{data:Data|null;loading:boolean;error:string;load:()=>Promise<void>}>((set)=>({data:null,loading:true,error:'',load:async()=>{
 if(flight)return flight;
 set({data:null,loading:true,error:''});
 flight=(async()=>{try{const r=await fetch('/api/account/commerce',{cache:'no-store'}),d=await r.json();if(!r.ok)throw new Error(d.error);set({data:d});}catch(e){set({error:e instanceof Error?e.message:'Unable to load prices'});}finally{set({loading:false});flight=null;}})();
 return flight;
}}));
export function useCustomerCommerce(){
 const userId=useUserStore(s=>s.userId),state=useCommerce();
 useEffect(()=>{const current=useCommerce.getState();if(!current.data||(userId&&current.data.userId!==userId))void current.load();},[userId,state.load,state.data?.userId]);
 return {...state,isUS:state.data?.market==='US',ready:!!state.data&&!state.loading&&(!userId||state.data.userId===userId)};
}

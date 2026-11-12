'use client';
import { useEffect,useState } from 'react';
import {usPricing} from './catalog';
export function usePricing(paywall=false){const [pricing,setPricing]=useState(usPricing()),[isLoading,setLoading]=useState(true),[defaultBundle,setDefaultBundle]=useState<string|null>(null),[enabled,setEnabled]=useState(false);useEffect(()=>{let cancelled=false;fetch(`/api/us/main/pricing${paywall?'?experiment=paywall':''}`, {cache:'no-store'}).then(r=>r.json()).then(d=>{if(!cancelled&&d.pricing){setPricing(d.pricing);setEnabled(d.enabled);setDefaultBundle(d.defaultBundle||null);}}).catch(()=>{}).finally(()=>{if(!cancelled)setLoading(false);});return()=>{cancelled=true;};},[paywall]);return {pricing,isLoading,enabled,defaultBundle};}

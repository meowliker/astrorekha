'use client';
import { useEffect,useState } from 'react';
import {usPricing} from './catalog';
export function usePricing(){const [pricing,setPricing]=useState(usPricing()),[isLoading,setLoading]=useState(true),[enabled,setEnabled]=useState(false);useEffect(()=>{let cancelled=false;fetch('/api/us/main/pricing',{cache:'no-store'}).then(r=>r.json()).then(d=>{if(!cancelled&&d.pricing){setPricing(d.pricing);setEnabled(d.enabled);}}).catch(()=>{}).finally(()=>{if(!cancelled)setLoading(false);});return()=>{cancelled=true;};},[]);return {pricing,isLoading,enabled};}

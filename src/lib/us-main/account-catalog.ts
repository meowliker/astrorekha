import snapshot from './inr-catalog-snapshot.json';
import {INTRO_USD_INR,type UsPrices} from './catalog';
import {isReportAvailableForPurchase} from '@/lib/customer-report-visibility';
import {CHAT_UNLIMITED_PASS_ID,CHAT_UNLIMITED_PASS_NAME,CHAT_UNLIMITED_PASS_PRICE_INR} from '@/lib/chat-unlimited-pass';
export type AccountPurchaseType='report'|'coins'|'chat_pass';
export type AccountProduct={id:string;name:string;type:AccountPurchaseType;cents:number|null;features:string[];coins:number;chatPassMinutes:number};
export const ACCOUNT_INTRO_PRICES:UsPrices=Object.fromEntries([
 ...snapshot.reports.map(p=>[p.id,Math.round(p.price/INTRO_USD_INR*100)]),
 ...snapshot.coinPackages.map(p=>[p.id,Math.round(p.price/INTRO_USD_INR*100)]),
 [CHAT_UNLIMITED_PASS_ID,Math.round(CHAT_UNLIMITED_PASS_PRICE_INR/INTRO_USD_INR*100)],
]);
export function accountCatalog(prices:UsPrices):AccountProduct[]{
 return [
  ...snapshot.reports.filter(p=>p.active&&isReportAvailableForPurchase(p.feature)).map(p=>({id:p.id,name:p.name,type:'report' as const,features:[p.feature],coins:0,chatPassMinutes:0})),
  ...snapshot.coinPackages.filter(p=>p.active).map(p=>({id:p.id,name:`${Math.floor(p.coins/3)} Questions`,type:'coins' as const,features:[],coins:p.coins,chatPassMinutes:0})),
  {id:CHAT_UNLIMITED_PASS_ID,name:CHAT_UNLIMITED_PASS_NAME,type:'chat_pass' as const,features:[],coins:0,chatPassMinutes:20},
 ].map(p=>({...p,cents:Number.isSafeInteger(prices[p.id])&&prices[p.id]>=50&&prices[p.id]<=100000?prices[p.id]:null}));
}
export function quoteAccountProduct(type:AccountPurchaseType,id:string,prices:UsPrices){
 const product=accountCatalog(prices).find(p=>p.type===type&&p.id===id);
 if(!product||product.cents===null)throw new Error('USD product pricing is unavailable');
 return {lines:[product],cents:product.cents,features:product.features,coins:product.coins};
}

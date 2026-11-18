const {test}=require('node:test'),assert=require('node:assert/strict');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const {retainVerifiedGoogleProfit:merge}=require('../src/lib/google-profit-retention');
const at='2026-11-17T10:00:00Z';
function report({cost=100,reason,profit=900,received=1000,funnel='soulmate'}={}) {
 return {funnel,exchangeRate:93.96,dayMode:'google_account',sourceFetchedAt:at,unassignedDates:[],unknownRefundTime:false,
 account:{id:'india',currency:'INR',timezone:'Asia/Calcutta',rows:[{date:'2026-11-17',costMicros:cost,...reason?{unavailableReason:reason}:{}}]},
 rows:[{date:'2026-11-17',received,profit,netRevenue:profit,orders:1}]};
}
test('temporary mismatch keeps the whole verified row, not fresh revenue against stale cost',()=>{
 const old=report(),fresh=report({cost:null,reason:'updating',profit:null,received:2000});
 const result=merge(fresh,old);assert.equal(result.rows[0].received,1000);assert.equal(result.rows[0].profit,900);assert.equal(result.rows[0].retainedAt,at);assert.equal(result.account.rows[0].costMicros,100);assert.deepEqual(result.retainedDates,['2026-11-17']);
 assert.equal(fresh.rows[0].received,2000);assert.equal(fresh.account.rows[0].costMicros,null);
});
test('repeated mismatches never advance the last verified time; later valid corrections replace it',()=>{
 const pending=report({cost:null,reason:'updating',profit:null});const retained=merge(pending,report());
 retained.sourceFetchedAt='2026-11-17T11:00:00Z';assert.equal(merge(pending,retained).rows[0].retainedAt,at);
 const corrected=merge(report({cost:90,profit:910}),retained);assert.equal(corrected.rows[0].profit,910);assert.equal(corrected.rows[0].retainedAt,undefined);assert.deepEqual(corrected.retainedDates,[]);
});
test('first unavailable report never fabricates zeros or profit',()=>{const r=merge(report({cost:null,reason:'updating',profit:null}),null);assert.equal(r.rows[0].profit,null);assert.equal(r.account.rows[0].costMicros,null);});
test('unknown destinations, new unmatched orders and unknown refund times cannot reuse profit',()=>{
 for(const extra of [{unassignedDates:['2026-11-17']},{unknownRefundTime:true}])assert.equal(merge({...report({cost:null,reason:'updating',profit:null}),...extra},report()).rows[0].profit,null);
 assert.equal(merge(report({cost:null,reason:'unattributed',profit:null}),report()).rows[0].profit,null);
});
test('account, timezone, currency, funnel and exchange rate never leak between saved reports',()=>{
 const pending=report({cost:null,reason:'updating',profit:null});
 for(const key of ['id','currency','timezone']){const old=report();old.account[key]='different';assert.equal(merge(pending,old).rows[0].profit,null);}
 for(const key of ['funnel','exchangeRate','dayMode']){const old=report();old[key]='different';assert.equal(merge(pending,old).rows[0].profit,null);}
});
test('zero is a valid verified spend, and main-funnel null profit is never retained',()=>{
 const pending=report({cost:null,reason:'updating',profit:null});assert.equal(merge(pending,report({cost:0})).account.rows[0].costMicros,0);
 const p=report({funnel:'astrorekha',cost:null,reason:'updating',profit:null});assert.equal(merge(p,report({funnel:'astrorekha',profit:null})).rows[0].netRevenue,null);
});

test('changing date ranges can recover a verified day from another compatible snapshot',()=>{
 const fresh=report({cost:null,reason:'updating',profit:null});
 const otherRange={...report(),dateRange:{start:'2026-10-19',end:'2026-11-17'}};
 const retained=merge(merge(fresh,null),otherRange);assert.equal(retained.rows[0].profit,900);
 const unrelated=report({profit:500});assert.equal(merge(retained,unrelated).rows[0].profit,900);
 assert.equal(merge(retained,unrelated).rows[0].retainedAt,at);
});

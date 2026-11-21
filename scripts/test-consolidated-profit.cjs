const {test}=require('node:test'),assert=require('node:assert/strict');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const {financialValues,combineRow,totalRows,sumKnown,retainConsolidatedSpend,countryDate,countryTimezone}=require('../src/lib/consolidated-profit');
const {trackingDayStartUtc,nextTrackingDayStartUtc}=require('../src/lib/tracking-dashboard');
const {workspaceForPath,canAccess}=require('../src/lib/admin-workspaces');
const values=(received,spend,gst=0)=>financialValues({received,refund:0,adsInr:spend,adsUsd:spend/100,gst,orders:1,bundles:1},'INR');
const part=(key,received,spend,gst=0)=>({key,label:key,values:values(received,spend,gst),salesTax:gst,adTax:0,scopeKey:key,retainAllowed:true,fetchedAt:'2026-11-21T00:00:00Z'});
const {googleAccountDayWindow}=require('../src/lib/google-ads-reporting');
const {metaSpendForCalendarDays}=require('../src/lib/consolidated-meta-calendar');
test('India stays midnight IST; US follows New York calendar including DST',()=>{
 const window=(date,country)=>googleAccountDayWindow(date,countryTimezone(country));
 assert.equal(new Date(window('2026-11-21','india').start).toISOString(),'2026-11-20T18:30:00.000Z');
 assert.equal(new Date(window('2026-11-21','us').start).toISOString(),'2026-11-21T05:00:00.000Z');
 assert.equal(new Date(window('2026-07-21','us').start).toISOString(),'2026-07-21T04:00:00.000Z');
 assert.equal(window('2026-11-01','us').end-window('2026-11-01','us').start,25*3600000);
 assert.equal(window('2026-03-08','us').end-window('2026-03-08','us').start,23*3600000);
 assert.equal(countryDate(new Date('2026-11-21T04:59:59Z'),'us'),'2026-11-20');
 assert.equal(countryDate(new Date('2026-11-21T05:00:00Z'),'us'),'2026-11-21');
});
test('New York Meta rollup uses complete account days and maps other-zone hours',()=>{
 const base={start:'2026-11-01',end:'2026-11-01',timezone:'America/New_York',accountTimezone:'America/New_York',accountWindow:{startMillis:0,endMillis:Date.now()+86400000},now:Date.now()+86400000};
 assert.equal(metaSpendForCalendarDays({...base,daily:[{campaign_id:'a',date_start:'2026-11-01',spend:'125'}],hourly:[]})['2026-11-01'].total,125);
 const hours=[{campaign_id:'a',date_start:'2026-11-21',spend:'10',hourly_stats_aggregated_by_advertiser_time_zone:'04:00:00 - 04:59:59'}, {campaign_id:'a',date_start:'2026-11-21',spend:'20',hourly_stats_aggregated_by_advertiser_time_zone:'05:00:00 - 05:59:59'}];
 const result=metaSpendForCalendarDays({...base,start:'2026-11-20',end:'2026-11-21',accountTimezone:'UTC',daily:[],hourly:hours});
 assert.equal(result['2026-11-20'].total,10);assert.equal(result['2026-11-21'].total,20);
 assert.throws(()=>metaSpendForCalendarDays({...base,accountTimezone:'UTC',daily:[{campaign_id:'a',date_start:'2026-11-01',spend:'10'}],hourly:[]}),/Missing Meta hourly/);
});
test('add monetary amounts but recompute ratios; unknown spend never becomes zero',()=>{
 const row=combineRow('2026-11-21',[part('normal',1000,500,50),part('soulmate',100,10,10)],[],'INR');
 assert.equal(row.values.revenue,1100);assert.equal(row.values.profit,530);assert.equal(row.values.roas,1100/510);assert.equal(row.values.margin,530/1100*100);
 assert.equal(sumKnown([1,null]),null);
 const bad=part('google',100,0);bad.values.adsInr=null;
 assert.equal(combineRow('2026-11-21',[part('normal',1000,500),bad],[],'INR').values.profit,null);
 assert.throws(()=>combineRow('2026-11-21',[part('normal',1,1),part('normal',1,1)],[],'INR'),/Duplicate/);
});
test('shared balance counts once, conflicting values fail closed, period balance is not summed',()=>{
 const b={id:'same-account',name:'Shared',value:500,capturedAt:'2026-11-21T00:00:00Z'};
 const first=combineRow('2026-11-20',[part('normal',100,20)],[{...b,value:400}], 'INR');
 const last=combineRow('2026-11-21',[part('normal',100,20)],[b,b], 'INR');
 assert.equal(last.values.balance,500);assert.equal(last.balances.length,1);
 assert.equal(totalRows([first,last],'INR').values.balance,500);
 assert.equal(combineRow('x',[],[b,{...b,value:300}],'INR').values.balance,null);
});
test('retaining verified spend preserves fresh revenue and recalculates profit and GST',()=>{
 const oldPart=part('google',1000,200,180);oldPart.adTax=-36;oldPart.salesTax=216;
 const oldRow=combineRow('2026-11-21',[oldPart],[],'INR');
 const report={country:'india',currency:'INR',dayMode:'calendar_ist',exchangeRate:100,rows:[oldRow],total:oldRow,fetchedAt:'2026-11-21T00:00:00Z'};
 const freshPart=part('google',2000,0,360);freshPart.values.adsInr=null;freshPart.values.adsUsd=null;freshPart.values.gst=null;freshPart.salesTax=360;
 const freshRow=combineRow('2026-11-21',[freshPart],[],'INR');
 const fresh={...report,rows:[freshRow]};
 const retained=retainConsolidatedSpend(fresh,report).rows[0];
 assert.equal(retained.values.revenue,2000);assert.equal(retained.values.adsInr,200);assert.equal(retained.values.gst,324);assert.equal(retained.values.profit,1476);
 assert.ok(retained.contributions[0].retainedAt);
 freshPart.scopeKey='changed-campaigns';assert.equal(retainConsolidatedSpend(fresh,report).rows[0].values.adsInr,null);
 freshPart.scopeKey='google';freshPart.retainAllowed=false;assert.equal(retainConsolidatedSpend(fresh,report).rows[0].values.adsInr,null);
});
test('cross-workspace report is administrator only on page and API, including nested paths',()=>{
 for(const path of ['/admin/consolidated-profit','/api/admin/consolidated-profit','/api/admin/consolidated-profit/nested']){
  assert.equal(workspaceForPath(path),'administrator');
  assert.equal(canAccess({isAdministrator:false,workspaces:['astrorekha']},workspaceForPath(path)),false);
 }
});

test('available balance survives missing accounts, preserves zero and counts shared accounts once',()=>{
 const known={id:'a',name:'A',value:100,capturedAt:'2026-11-21T00:00:00Z',sources:['normal:meta','soulmate:meta']};
 const missing={id:'b',name:'B',value:null,capturedAt:''};
 assert.equal(combineRow('x',[],[known,known,missing],'INR').values.balance,100);
 assert.equal(combineRow('x',[],[{...known,value:0},missing],'INR').values.balance,0);
 assert.equal(combineRow('x',[],[missing],'INR').values.balance,null);
 assert.equal(combineRow('x',[],[],'INR').values.balance,null);
});
test('account spend groups aggregate by account within each source and follow retained costs',()=>{
 const a=part('normal',100,30);a.accounts=[{id:'1',name:'One',adsInr:10,adsUsd:.1},{id:'2',name:'Two',adsInr:20,adsUsd:.2}];
 const b=part('normal',200,45);b.accounts=[{id:'1',name:'One',adsInr:15,adsUsd:.15},{id:'2',name:'Two',adsInr:30,adsUsd:.3}];
 const rows=[combineRow('2026-11-20',[a],[],'INR'),combineRow('2026-11-21',[b],[],'INR')];
 const total=totalRows(rows,'INR');
 assert.deepEqual(total.contributions[0].accounts.map(a=>a.adsInr),[25,50]);
 assert.equal(total.contributions[0].accounts.reduce((sum,a)=>sum+a.adsInr,0),total.values.adsInr);
 const report={country:'india',currency:'INR',dayMode:'calendar_ist',exchangeRate:100,rows,total,fetchedAt:'2026-11-21T00:00:00Z'};
 const unavailable={...b,accounts:[],values:{...b.values,adsInr:null,adsUsd:null}};
 const fresh={...report,rows:[combineRow('2026-11-21',[unavailable],[],'INR')]};
 assert.deepEqual(retainConsolidatedSpend(fresh,report).rows[0].contributions[0].accounts,b.accounts);
 b.accounts[0].adsInr=null;
 assert.equal(totalRows(rows,'INR').contributions[0].accounts[0].adsInr,null);
});

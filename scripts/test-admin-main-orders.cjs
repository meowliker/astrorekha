const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const resolve=Module._resolveFilename;Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.join(process.cwd(),'src',id.slice(2)):id,...args)};
let rows=[];
const load=Module._load;Module._load=function(id,...args){if(id==='@/lib/supabase-admin')return{getSupabaseAdmin:()=>({rpc:async()=>({error:{code:"PGRST202"}}),from(table){let data=table==='payments'?rows:table==='admin_workspace_members'?[{admin_id:'fixture',active:true,is_administrator:false,workspaces:['astrorekha']}]:table==='users'?[]:table==='settings'?[{value:null}]:[{admin_id:'fixture',id:'fixture',expires_at:'2099-01-01'}];const q={select(){return q},eq(){return q},in(field,values){if(table==='payments')data=data.filter(row=>values.includes(row[field]));return q},or(expression){data=data.filter(row=>expression.split(',').some(part=>{const [field,,value]=part.split('.');return row[field]===value}));return q},gte(field,value){data=data.filter(row=>row[field]>=value);return q},lte(field,value){data=data.filter(row=>row[field]<=value);return q},order(){return q},range(a,b){data=data.slice(a,b+1);return q},maybeSingle(){data=data[0];return q},then(ok,no){return Promise.resolve({data,error:null}).then(ok,no)}};return q}})};return load.call(this,id,...args)};
const {GET}=require('../src/app/api/admin/orders/route');const {NextRequest}=require('next/server');
const paid=(id,extra={})=>({id,payment_status:'paid',payu_txn_id:null,user_id:null,type:'report',feature:'soulmateSketch',bundle_id:null,amount:65962,currency:'INR',created_at:'2026-11-10T08:00:00Z',...extra});
test('main orders exclude both standalone funnels before search, count and pagination; main Soulmate products remain',async()=>{
 rows=[...Array.from({length:1001},(_,i)=>paid(`pay_sm_${i}`)),paid('pay_us_sm_2'),paid('gateway-mirror',{payu_txn_id:'us_sm_3'}),paid('pay_sm_4',{payu_txn_id:'alternate'}),...Array.from({length:12},(_,i)=>paid(`pnl-main-${i}`))];
 const first=await (await GET(new NextRequest('http://local/api/admin/orders?pageSize=10',{headers:{'x-admin-session':'a'.repeat(64)}}))).json();assert.equal(first.total,12);assert.equal(first.totalPages,2);assert.equal(first.orders.length,10);assert.equal(first.orders[0].id,'pnl-main-0');assert.ok(first.orders[0].items.includes('Soulmate Sketch'));
 const second=await (await GET(new NextRequest('http://local/api/admin/orders?pageSize=10&page=2',{headers:{'x-admin-session':'a'.repeat(64)}}))).json();assert.deepEqual(second.orders.map(r=>r.id),['pnl-main-10','pnl-main-11']);
 const excluded=await (await GET(new NextRequest('http://local/api/admin/orders?search=pay_sm',{headers:{'x-admin-session':'a'.repeat(64)}}))).json();assert.equal(excluded.total,0);
 const denied=await GET(new NextRequest('http://local/api/admin/orders'));assert.equal(denied.status,401);
});
test('main order source filters use route fallback while keeping actual funnel boundaries',async()=>{
 rows=[paid('pnl-discover',{landing_path:'/discover'}),paid('pnl-normal',{landing_path:'/'}),paid('pay_sm_side',{landing_path:'/soulmate/discover'}),paid('pnl-explicit-meta',{landing_path:'/discover',utm_source:'facebook',utm_medium:'cpc'})];
 const get=async(source)=>(await (await GET(new NextRequest(`http://local/api/admin/orders?adSource=${source}`,{headers:{'x-admin-session':'a'.repeat(64)}}))).json()).orders.map(r=>r.id);
 assert.deepEqual(await get('google'),['pnl-discover','pnl-explicit-meta']);assert.deepEqual(await get('meta'),['pnl-normal']);assert.equal((await get('all')).length,3);
});

test('gateway ID search resolves all six payments and respects payment status, workspace, dates and type',async()=>{
 const ids=['30669700142','30663102475','30057093393','29944145953','30980316596','30732252389'];
 rows=ids.map((id,i)=>paid(`pay-order-${i}`,{payu_payment_id:id,payu_txn_id:`TXN_order_${i}`}));
 const get=async(query)=>{const response=await GET(new NextRequest(`http://local/api/admin/orders?${query}`,{headers:{'x-admin-session':'a'.repeat(64)}}));assert.equal(response.status,200);return response.json()};
 for(const [i,id] of ids.entries()){const result=await get(`search=${id}`);assert.equal(result.total,1);assert.equal(result.orders[0].id,`pay-order-${i}`);assert.equal(result.orders[0].paymentId,id)}
 assert.equal((await get('search=TXN_order_0')).total,1);
 assert.equal((await get('search=30669700142&type=coins')).total,0);
 assert.equal((await get('search=30669700142&startDate=2026-11-11&endDate=2026-11-12')).total,0);
 rows=[paid('pay-normal',{gateway_transaction_id:'gateway_123456'}),paid('pay-google',{payu_payment_id:'12345678',landing_path:'/discover'}),paid('pay_sm_hidden',{payu_payment_id:'87654321'}),paid('pay-unpaid',{payu_payment_id:'99999999',payment_status:'failed'})];
 assert.equal((await get('search=gateway_123456')).orders[0].id,'pay-normal');
 assert.equal((await get('search=12345678&adSource=meta')).total,0);
 assert.equal((await get('search=12345678&adSource=google')).total,1);
 assert.equal((await get('search=87654321')).total,0);
 assert.equal((await get('search=99999999')).total,0);
});

const assert=require('node:assert/strict'),{test}=require('node:test'),Module=require('node:module'),path=require('node:path'),fs=require('node:fs');
const resolve=Module._resolveFilename;Module._resolveFilename=function(name,...rest){return resolve.call(this,name.startsWith('@/')?path.join(__dirname,'../src',name.slice(2)):name,...rest)};
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node',jsx:'react-jsx'}});
process.env.REPORT_SESSION_SECRET='local-fixture-secret';
const {PGlite}=require('@electric-sql/pglite'),{NextRequest}=require('next/server'),bcrypt=require('bcryptjs');
const security=require('../src/lib/purchase-access/security'),auth=require('../src/lib/report-session'),admin=require('../src/lib/supabase-admin');
const schema=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261116020000_purchase_access_email.sql'),'utf8');
async function setup(){const db=new PGlite();await db.exec(`
create role anon;create role authenticated;create role service_role bypassrls;
create table users(id text primary key,email text,password_hash text,updated_at timestamptz,coins int default 7,unlocked_features jsonb default '{"palmReading":true}');
create table payments(id text primary key,user_id text,customer_email text,amount int,currency text default 'INR',type text default 'bundle',payment_status text default 'paid',fulfilled_at timestamptz default now(),created_at timestamptz default now(),payment_mode text default 'live',gateway text default 'pinelabs');
create table us_main_orders(id text primary key,user_id text,customer_email text,amount_cents int,paid_amount_cents int,payment_status text default 'paid',fulfilled_at timestamptz default now(),created_at timestamptz default now(),payment_mode text default 'live',attribution jsonb default '{"trackingEnvironment":"production"}');
insert into users(id,email) values('owner','owner@example.invalid'),('other','other@example.invalid');
`);await db.exec(schema);await db.exec("update purchase_access_config set starts_at=now()-interval '1 day'");return db;}
const invoiceFixture={invoiceNumber:'AR-TEST-1',invoiceDate:new Date().toISOString(),customer:{userId:'owner',email:'owner@example.invalid'},payment:{status:'paid',type:'bundle',gateway:'Pine Labs',txnId:'fixture-paid',paymentId:'fixture',paidAt:new Date().toISOString()},items:[{name:'Palm Reading',quantity:1,amount:659.62}],subtotal:659.62,taxLines:[],total:659.62,currency:'INR',deliveryStatus:'Completed digitally in-app'};
const scalar=async(db,sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
async function emailRow(db,id='in-paid'){await db.query("insert into payments(id,user_id,customer_email,amount) values($1,'owner','owner@example.invalid',65962)",[id]);await db.query('select enqueue_purchase_access_emails()');return (await db.query('select * from purchase_access_emails where order_id=$1',[id])).rows[0];}
async function prepare(db,row){const code=security.purchaseCode(row.id,row.code_nonce);await db.query("update purchase_access_emails set code_hash=$1,first_attempt_at=now(),status='sent',sent_at=now() where id=$2",[security.hashSecret(code),row.id]);return code;}
const consume=(db,email,code,grant,ip='fixture-ip')=>scalar(db,'select consume_purchase_access_code($1,$2,$3,$4)',[email,security.hashSecret(code),ip,security.hashSecret(grant)]);

test('only new verified fulfilled main-funnel payments queue; repeated runs do not duplicate or alter purchases',async()=>{
 const db=await setup();try{
 await db.exec(`insert into payments(id,user_id,customer_email,amount) values('paid','owner','owner@example.invalid',65962),('pending','owner','owner@example.invalid',65962),('unfulfilled','owner','owner@example.invalid',65962),('old','owner','owner@example.invalid',65962),('test','owner','owner@example.invalid',100),('wrong-email','owner','other@example.invalid',100),('free','owner','owner@example.invalid',0),('sm_other','owner','owner@example.invalid',100);
 update payments set payment_status='pending' where id='pending';update payments set fulfilled_at=null where id='unfulfilled';update payments set created_at=now()-interval '2 days',fulfilled_at=now()-interval '2 days' where id='old';update payments set payment_mode='test' where id='test';
 insert into us_main_orders(id,user_id,customer_email,amount_cents,paid_amount_cents) values('us-paid','owner','owner@example.invalid',704,100),('us-local','owner','owner@example.invalid',704,100);
 update us_main_orders set attribution='{"trackingEnvironment":"local"}' where id='us-local';`);
 const before=(await db.query('select * from payments order by id')).rows;
 assert.equal(await scalar(db,'select enqueue_purchase_access_emails()'),2);assert.equal(await scalar(db,'select enqueue_purchase_access_emails()'),0);
 const rows=(await db.query('select order_id,amount_minor from purchase_access_emails order by order_id')).rows;assert.deepEqual(rows,[{order_id:'paid',amount_minor:65962},{order_id:'us-paid',amount_minor:100}]);
 assert.deepEqual((await db.query('select * from payments order by id')).rows,before);assert.equal(await scalar(db,"select coins from users where id='owner'"),7);
 await db.exec('set role anon');await assert.rejects(()=>db.query('select * from purchase_access_emails'),/permission denied/);await assert.rejects(()=>db.query('select enqueue_purchase_access_emails()'),/permission denied/);await db.exec('reset role; set role authenticated');await assert.rejects(()=>db.query('select * from purchase_password_grants'),/permission denied/);
 }finally{await db.close()}
});
test('a confirmation code has no expiry, can be consumed exactly once, and password setup needs no old password',async()=>{
 const db=await setup();try{
 const row=await emailRow(db),code=await prepare(db,row),grant='a'.repeat(64);await db.query("update purchase_access_emails set created_at='2000-01-01',first_attempt_at='2000-01-01' where id=$1",[row.id]);
 const results=await Promise.all([consume(db,'owner@example.invalid',code,grant),consume(db,'owner@example.invalid',code,'b'.repeat(64))]);assert.equal(results.filter(x=>x.userId==='owner').length,1);assert.equal(results.filter(x=>x.error==='invalid_code').length,1);
 const winner=results[0].userId?grant:'b'.repeat(64),hash=await bcrypt.hash('FixturePassword123!',12);
 assert.equal(await scalar(db,'select finish_purchase_password($1,$2,$3)',['other',security.hashSecret(winner),hash]),false);
 assert.equal(await scalar(db,'select finish_purchase_password($1,$2,$3)',['owner',security.hashSecret(winner),hash]),true);
 assert.equal(await scalar(db,'select finish_purchase_password($1,$2,$3)',['owner',security.hashSecret(winner),hash]),false);
 const user=(await db.query("select * from users where id='owner'")).rows[0];assert.ok(await bcrypt.compare('FixturePassword123!',user.password_hash));assert.equal(user.coins,7);assert.deepEqual(user.unlocked_features,{palmReading:true});
 const stored=(await db.query('select * from purchase_access_emails')).rows[0];assert.ok(!JSON.stringify(stored).includes(code));assert.ok(stored.used_at);assert.equal(stored.code_hash,security.hashSecret(code));
 }finally{await db.close()}
});
test('skip leaves password intact; setup proof expires; revoked codes and changed email are rejected; guesses are limited',async()=>{
 const db=await setup();try{
 const row=await emailRow(db),code=await prepare(db,row);await consume(db,'owner@example.invalid',code,'s'.repeat(64));
 assert.equal(await scalar(db,'select finish_purchase_password($1,$2,null)',['owner',security.hashSecret('s'.repeat(64))]),true);assert.equal(await scalar(db,"select password_hash from users where id='owner'"),null);
 const second=await emailRow(db,'second'),code2=await prepare(db,second);await consume(db,'owner@example.invalid',code2,'e'.repeat(64));await db.exec("update purchase_password_grants set expires_at=now()-interval '1 second'");assert.equal(await scalar(db,'select finish_purchase_password($1,$2,null)',['owner',security.hashSecret('e'.repeat(64))]),false);
 const third=await emailRow(db,'third'),code3=await prepare(db,third);await db.query('update purchase_access_emails set revoked_at=now() where id=$1',[third.id]);assert.equal((await consume(db,'owner@example.invalid',code3,'r'.repeat(64))).error,'invalid_code');
 const fourth=await emailRow(db,'fourth'),code4=await prepare(db,fourth);await db.exec("update users set email='changed@example.invalid' where id='owner'");assert.equal((await consume(db,'owner@example.invalid',code4,'c'.repeat(64))).error,'invalid_code');
 await db.exec('delete from purchase_access_attempts');for(let i=0;i<5;i++)assert.equal((await consume(db,'missing@example.invalid','BAD',String(i))).error,'invalid_code');assert.equal((await consume(db,'missing@example.invalid','BAD','6')).error,'rate_limited');
 }finally{await db.close()}
});
test('email leases and retry window prevent concurrent sends or late ambiguous duplicates',async()=>{
 const db=await setup();try{
 await emailRow(db);const claim1='00000000-0000-4000-a000-000000000001',claim2='00000000-0000-4000-a000-000000000002';
 assert.equal((await db.query('select * from claim_purchase_access_emails($1,5)',[claim1])).rows.length,1);assert.equal((await db.query('select * from claim_purchase_access_emails($1,5)',[claim2])).rows.length,0);
 await db.exec("update purchase_access_emails set claimed_at=now()-interval '3 minutes',first_attempt_at=now()-interval '3 minutes'");assert.equal((await db.query('select * from claim_purchase_access_emails($1,5)',[claim2])).rows.length,1);
 await db.exec("update purchase_access_emails set claimed_at=now()-interval '3 minutes',first_attempt_at=now()-interval '11 minutes'");assert.equal((await db.query('select * from claim_purchase_access_emails($1,5)',[claim1])).rows.length,0);assert.equal(await scalar(db,'select status from purchase_access_emails'),'needs_review');
 }finally{await db.close()}
});
test('confirmation template and provider retries keep one code/key; local jobs cannot send mail',async t=>{
 const mail=require('../src/lib/purchase-access/email');const row={id:'00000000-0000-4000-a000-000000000001',order_id:'fixture-paid',email:'owner@example.invalid',source:'IN',amount_minor:65962,currency:'INR',code_nonce:'nonce'};
 const code=security.purchaseCode(row.id,row.code_nonce);assert.equal(code.length,8);assert.equal(security.normalizePurchaseCode(code.match(/.{4}/g).join('-').toLowerCase()),code);
 const html=mail.renderPurchaseAccessEmail(row,code,invoiceFixture);assert.ok(html.includes('₹659.62'));assert.ok(html.includes('no expiry'));assert.ok(html.includes(code));assert.ok(!/href="[^"]*code=/i.test(html));
 t.mock.method(global,'fetch',async(_url,init)=>{const b=JSON.parse(init.body);assert.equal(b.headers.idempotencyKey,row.id);assert.equal(b.attachment[0].name,'invoice.pdf');assert.match(b.htmlContent,/password field/);return new Response(JSON.stringify({code:'duplicate_parameter',message:'Email for the idempotency key has already been processed'}),{status:400})});process.env.BREVO_API_KEY='fixture';assert.equal((await mail.deliverAccessEmail(row,html,{name:'invoice.pdf',content:'fixture'})).status,'sent');
 t.mock.method(global,'fetch',async()=>{throw Error('Network unavailable')});assert.equal((await mail.deliverAccessEmail(row,html,{name:'invoice.pdf',content:'fixture'})).status,'retry');
 delete process.env.VERCEL_ENV;t.mock.method(admin,'getSupabaseAdmin',()=>{throw Error('Local job must not access shared database')});assert.deepEqual(await mail.sendPurchaseAccessEmails(),{skipped:true});
});
const request=(path,body,cookie='',origin='https://astrorekha.com')=>new NextRequest('https://astrorekha.com'+path,{method:'POST',headers:{origin,'content-type':'application/json',cookie},body:JSON.stringify(body)});
test('API issues signed login and scoped password proof only after atomic consumption; never calls payment or tracking APIs',async t=>{
 let result={userId:'owner'},calls=[];t.mock.method(admin,'getSupabaseAdmin',()=>({from(){const q={select(){return q},eq(){return q},limit(){return q},maybeSingle:async()=>({data:{id:'owner',email:'owner@example.invalid',password_hash:null},error:null})};return q},rpc:async(name,args)=>{calls.push({name,args});return {data:result,error:null}}}));const api=require('../src/app/api/auth/login/route');
 let res=await api.POST(request('/api/auth/login',{email:'owner@example.invalid',password:'A'.repeat(8)}));assert.equal(res.status,200);assert.equal(auth.verifyReportSession(res.cookies.get('ar_report_session').value),'owner');assert.ok(res.cookies.get('ar_purchase_reset').httpOnly);assert.equal(res.cookies.get('ar_purchase_reset').path,'/api/auth/purchase-access');assert.equal(calls[0].name,'consume_purchase_access_code');assert.ok(!JSON.stringify(calls).includes('A'.repeat(8)));
 result={error:'invalid_code'};res=await api.POST(request('/api/auth/login',{email:'owner@example.invalid',password:'A'.repeat(8)}));assert.equal(res.status,401);assert.equal(res.cookies.get('ar_report_session'),undefined);
 result={error:'rate_limited'};assert.equal((await api.POST(request('/api/auth/login',{email:'owner@example.invalid',password:'A'.repeat(8)}))).status,429);
 const before=calls.length;assert.equal((await api.POST(request('/api/auth/login',{email:'owner@example.invalid',password:'A'.repeat(8)},'','https://evil.invalid'))).status,403);assert.equal(calls.length,before);
 const password=require('../src/app/api/auth/purchase-access/password/route');assert.equal((await password.POST(request('/api/auth/purchase-access/password',{newPassword:'NewPassword123!',confirmPassword:'NewPassword123!'}))).status,401);
 const cookie='ar_report_session='+auth.createReportSession('owner')+'; ar_purchase_reset='+'a'.repeat(64);
 t.mock.method(admin,'getSupabaseAdmin',()=>({from(){const q={select(){return q},eq(){return q},is(){return q},gt(){return q},maybeSingle:async()=>({data:{user_id:'owner'},error:null})};return q},rpc:async(name,args)=>{assert.equal(name,'finish_purchase_password');assert.equal(args.p_user,'owner');assert.ok(await bcrypt.compare('NewPassword123!',args.p_password_hash));return {data:true,error:null}}}));
 res=await password.POST(request('/api/auth/purchase-access/password',{newPassword:'NewPassword123!',confirmPassword:'NewPassword123!'},cookie));assert.equal(res.status,200);assert.equal(res.cookies.get('ar_purchase_reset').maxAge,0);
});

test('background confirmation pipeline saves the hash before provider delivery and repeated runs do not send again', async t => {
 const db = await setup(), previousEnvironment = process.env.VERCEL_ENV;
 process.env.VERCEL_ENV = 'production'; process.env.BREVO_API_KEY = 'fixture';
 t.after(async () => { if(previousEnvironment===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previousEnvironment; await db.close(); });
 await db.exec("insert into payments(id,user_id,customer_email,amount) values('pipeline','owner','owner@example.invalid',65962)");
 await db.query('select enqueue_purchase_access_emails()');
 await db.query('update purchase_access_emails set invoice_snapshot=$1',[invoiceFixture]);
 const adapter = {
  async rpc(name,args) {
   if(name==='enqueue_purchase_access_emails')return {data:await scalar(db,'select enqueue_purchase_access_emails()'),error:null};
   assert.equal(name,'claim_purchase_access_emails');
   return {data:(await db.query('select * from claim_purchase_access_emails($1,$2)',[args.p_claim,args.p_limit])).rows,error:null};
  },
  from(table) {
   assert.equal(table,'purchase_access_emails'); let values, filters=[];
   async function execute(){
    const parameters=Object.values(values),sets=Object.keys(values).map((k,i)=>`${k}=$${i+1}`),where=filters.map(([k,v])=>{parameters.push(v);return `${k}=$${parameters.length}`;});
    const result=await db.query(`update purchase_access_emails set ${sets.join(',')} where ${where.join(' and ')} returning id`,parameters);
    return {data:result.rows[0]||null,error:null};
   }
   const q={update(v){values=v;return q},eq(k,v){filters.push([k,v]);return q},select(){return q},maybeSingle:execute,then(resolve,reject){return execute().then(resolve,reject)}};
   return q;
  }
 };
 t.mock.method(admin,'getSupabaseAdmin',()=>adapter);
 let deliveries=0;
 t.mock.method(global,'fetch',async(url,init)=>{
  assert.equal(url,'https://api.brevo.com/v3/smtp/email'); deliveries++;
  const body=JSON.parse(init.body),row=(await db.query('select * from purchase_access_emails')).rows[0];
  assert.equal(body.headers.idempotencyKey,row.id); assert.equal(row.status,'sending');
  assert.equal(row.code_hash,security.hashSecret(security.purchaseCode(row.id,row.code_nonce)));
  assert.equal(body.to[0].email,'owner@example.invalid');assert.ok(Buffer.from(body.attachment[0].content,'base64').subarray(0,4).toString()==='%PDF');
  return Response.json({messageId:'fixture-message'},{status:201});
 });
 const worker=require('../src/lib/purchase-access/email').sendPurchaseAccessEmails;
 assert.equal((await worker()).sent,1); assert.equal((await worker()).processed,0); assert.equal(deliveries,1);
 const row=(await db.query('select * from purchase_access_emails')).rows[0];assert.equal(row.status,'sent');assert.equal(row.provider_message_id,'fixture-message');
 assert.equal((await consume(db,row.email,security.purchaseCode(row.id,row.code_nonce),'proof')).userId,'owner');
 assert.equal(await scalar(db,"select coins from users where id='owner'"),7);
});

test('origin checks accept the requested local host but reject cross-site and protocol changes',()=>{
 const local=new NextRequest('http://localhost:3210/api/auth/login',{headers:{host:'127.0.0.1:3210',origin:'http://127.0.0.1:3210','sec-fetch-site':'same-origin'}});
 assert.equal(security.sameOrigin(local),true);
 assert.equal(security.sameOrigin(new NextRequest(local.url,{headers:{host:'127.0.0.1:3210',origin:'https://127.0.0.1:3210'}})),false);
 assert.equal(security.sameOrigin(new NextRequest(local.url,{headers:{host:'127.0.0.1:3210',origin:'http://evil.invalid','sec-fetch-site':'cross-site'}})),false);
});

test('normal passwords retain priority even when they look like a confirmation code',async t=>{
 const hash=await bcrypt.hash('ABCD2345',12);
 t.mock.method(admin,'getSupabaseAdmin',()=>({from(){const q={select(){return q},eq(){return q},limit(){return q},update(){return q},maybeSingle:async()=>({data:{id:'owner',email:'owner@example.invalid',password_hash:hash},error:null})};return q},rpc(){throw Error('Ordinary password must not consume recovery code')}}));
 const response=await require('../src/app/api/auth/login/route').POST(request('/api/auth/login',{email:'owner@example.invalid',password:'ABCD2345'}));
 assert.equal(response.status,200);assert.equal((await response.json()).requiresPasswordSetup,undefined);assert.equal(response.cookies.get('ar_purchase_reset'),undefined);
});

test('browser invoice confirmation queues the same ledger; USD invoice uses captured discounted amounts',async t=>{
 const invoiceLib=require('../src/lib/purchase-access/invoice');let calls=0;
 t.mock.method(admin,'getSupabaseAdmin',()=>({from(){const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:{enabled:true,starts_at:'2000-01-01'},error:null})};return q},rpc:async name=>{assert.equal(name,'enqueue_purchase_access_emails');calls++;return {data:0,error:null}}}));
 assert.equal(await invoiceLib.queueInvoiceConfirmation(invoiceFixture),true);
 assert.equal(await invoiceLib.queueInvoiceConfirmation(invoiceFixture),true);assert.equal(calls,2,'repeated enqueue remains SQL-idempotent; no direct provider send');
 t.mock.method(admin,'getSupabaseAdmin',()=>({from(){const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:{id:'us_fixture',user_id:'owner',payment_status:'paid',fulfilled_at:new Date().toISOString(),paid_amount_cents:100,amount_cents:704,line_items:[{name:'A',cents:300},{name:'B',cents:404}],type:'bundle'},error:null})};return q}}));
 const invoice=await invoiceLib.purchaseInvoice({source:'US',order_id:'us_fixture',user_id:'owner',email:'owner@example.invalid',amount_minor:100});
 assert.equal(invoice.total,1);assert.equal(invoice.currency,'USD');assert.deepEqual(invoice.items.map(i=>i.amount),[0.43,0.57]);
});

const assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{const db=new PGlite();await db.exec(`
create table users(id text primary key,email text);
create table purchase_access_config(id boolean,enabled boolean,starts_at timestamptz);
create table payments(id text primary key,user_id text,customer_email text,amount bigint,created_at timestamptz default now(),fulfilled_at timestamptz,payment_status text,currency text,type text,payment_mode text,gateway text,utm_source text,landing_url text);
create table us_main_orders(id text primary key,user_id text,customer_email text,paid_amount_cents bigint,amount_cents bigint,created_at timestamptz default now(),fulfilled_at timestamptz,payment_status text,payment_mode text,attribution jsonb);
create table purchase_access_emails(source text,order_id text,user_id text,email text,amount_minor bigint,currency text,unique(source,order_id));
insert into users values('test','fixture@example.invalid');
insert into purchase_access_config values(true,true,'2020-01-01');
`);await db.exec(fs.readFileSync('supabase/migrations/20261125160000_gateway_purchase_emails.sql','utf8'));
for(const gateway of ['payu','paytm','pinelabs','airpay','shiprocket','unsupported'])await db.query(`insert into payments(id,user_id,customer_email,amount,fulfilled_at,payment_status,currency,type,payment_mode,gateway) values($1,'test','fixture@example.invalid',100,now(),'paid','INR','bundle','live',$1)`,[gateway]);
await db.exec(`insert into payments(id,user_id,customer_email,amount,fulfilled_at,payment_status,currency,type,payment_mode,gateway) values('unpaid','test','fixture@example.invalid',100,null,'pending','INR','bundle','live','shiprocket'),('sandbox','test','fixture@example.invalid',100,now(),'paid','INR','bundle','test','shiprocket'),('wrong-owner','test','other@example.invalid',100,now(),'paid','INR','bundle','live','shiprocket');`);
assert.equal((await db.query('select enqueue_purchase_access_emails() as n')).rows[0].n,5);
assert.equal((await db.query('select enqueue_purchase_access_emails() as n')).rows[0].n,0);
assert.deepEqual((await db.query('select order_id from purchase_access_emails order by order_id')).rows.map(r=>r.order_id),['airpay','paytm','payu','pinelabs','shiprocket']);
console.log('PASS: existing and new gateways queue once; unpaid, sandbox, unsupported and mismatched owner excluded');await db.close();})().catch(e=>{console.error(e);process.exit(1)});

const assert=require('node:assert/strict'),{test,beforeEach}=require('node:test'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const resolve=Module._resolveFilename;Module._resolveFilename=function(name,parent,...rest){return resolve.call(this,name.startsWith('@/')?path.join(__dirname,'../src',name.slice(2)):name,parent,...rest);};
let row,files,calls,uncertain;
const db={from(table){assert.equal(table,'soulmate_order_invoices');let values,filters=[];const q={select(){return q;},update(v){values=v;return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},or(){filters.push(r=>r.status==='pending');return q;},single:()=>run(),maybeSingle:()=>run(),then:(ok,fail)=>run().then(ok,fail)};async function run(){if(!filters.every(f=>f(row)))return{data:null,error:null};if(values)Object.assign(row,values);return{data:{...row},error:null};}return q;},storage:{from(){return{upload:async(key,pdf)=>{files[key]=Buffer.from(pdf);return{error:null};},download:async(key)=>({data:files[key]?new Blob([files[key]]):null,error:files[key]?null:{}})};}}};
const admin=require.resolve('../src/lib/supabase-admin');require.cache[admin]={id:admin,filename:admin,loaded:true,exports:{getSupabaseAdmin:()=>db}};
const {buildSoulmateCart}=require('../src/lib/soulmate-cart');
const {generateSoulmateInvoicePdf,soulmateConfirmationEmail}=require('../src/lib/soulmate-invoice-template');
const {prepareSoulmateInvoice,sendSoulmateConfirmation,invoicePdf}=require('../src/lib/soulmate-invoice');
beforeEach(()=>{const cart=buildSoulmateCart('express',['timeline']);row={id:crypto.randomUUID(),invoice_number:'ARS-26-0000042',issued_at:'2026-10-15T12:00:00Z',order_id:'sm_aaaaaaaaaaaaaaaaaaaa',source:'purchase',status:'pending',storage_path:null,pdf_sha256:null,snapshot:{customerName:'Anay',customerEmail:'recipient@example.invalid',orderId:'sm_aaaaaaaaaaaaaaaaaaaa',items:cart.lineItems,entitlements:cart.entitlements,subtotal:cart.baseAmount,gst:cart.gstAmount,total:cart.amount,paidAt:'2026-10-15T12:00:00Z',deliveryDueAt:null}};files={};calls=[];uncertain=false;process.env.BREVO_API_KEY='fixture';global.fetch=async(url,options)=>{calls.push(JSON.parse(options.body));if(uncertain)throw new Error('Timeout');return{ok:true,json:async()=>({messageId:'fixture-message'})};};});
test('email includes exact cart/tax, delivery and invoice; escapes customer text',()=>{row.snapshot.customerName='<script>alert(1)</script>';const email=soulmateConfirmationEmail(row);assert.match(email.html,/2,239.64/);assert.match(email.html,/341.64/);assert.match(email.html,/within 12 hours/);assert.match(email.html,/Soulmate Connection Timeline/);assert.match(email.html,/ARS-26-0000042/);assert.doesNotMatch(email.html,/<script>/);assert.match(email.html,/&lt;script&gt;/);});
test('PDF bytes and invoice number are stable on retries',async()=>{const first=await prepareSoulmateInvoice(row.id);const bytes=await invoicePdf(first);assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.deepEqual(bytes,generateSoulmateInvoicePdf(first));const second=await prepareSoulmateInvoice(row.id);assert.equal(first.invoice_number,second.invoice_number);assert.equal(Object.keys(files).length,1);});
test('concurrent confirmations send once and attach the same private PDF',async()=>{await prepareSoulmateInvoice(row.id);await Promise.all([sendSoulmateConfirmation(row.id),sendSoulmateConfirmation(row.id)]);await sendSoulmateConfirmation(row.id);assert.equal(calls.length,1);assert.equal(row.status,'sent');assert.equal(calls[0].attachment[0].name,`${row.invoice_number}.pdf`);assert.deepEqual(Buffer.from(calls[0].attachment[0].content,'base64'),files[row.storage_path]);assert.equal(calls[0].headers.idempotencyKey,row.id);});
test('uncertain send is flagged and never automatically repeated',async()=>{uncertain=true;await assert.rejects(sendSoulmateConfirmation(row.id));assert.equal(row.status,'needs_review');uncertain=false;await sendSoulmateConfirmation(row.id);assert.equal(calls.length,1);});
test('corrupted stored invoice cannot be sent',async()=>{await prepareSoulmateInvoice(row.id);files[row.storage_path]=Buffer.from('wrong');await assert.rejects(sendSoulmateConfirmation(row.id),/integrity/);assert.equal(calls.length,0);});
test('owner example has no paid claim and normal delivery stays 48 hours',()=>{row.snapshot.paidAt=null;const cart=buildSoulmateCart('standard',[]);Object.assign(row.snapshot,{items:cart.lineItems,entitlements:cart.entitlements});const email=soulmateConfirmationEmail(row);assert.match(email.html,/within 48 hours/);assert.doesNotMatch(email.html,/Total paid|test email|sample email/i);assert.match(email.html,/Order total/);});

test('current product label replaces historical display wording without altering stored snapshot',()=>{
 const oldName='Complete Soulmate Portrait: Fast Delivery + Description + Color Upgrade';
 row.snapshot.items[0].name=oldName;
 const email=soulmateConfirmationEmail(row);
 assert.match(email.html,/Complete Soulmate Vision/);assert.doesNotMatch(email.html,/Complete Soulmate Portrait/);assert.match(email.html,/Fast Delivery \+ Description \+ Color Upgrade/);
 assert.equal(row.snapshot.items[0].name,oldName);
 const cart=buildSoulmateCart('express',[]);assert.equal(cart.lineItems[0].name,'Complete Soulmate Vision: Fast Delivery + Description + Color Upgrade');assert.equal(cart.productInfo,cart.lineItems[0].name);
});

test('invoice and email display names omit promotional labels while preserving purchased snapshots',()=>{
 const {soulmateReceiptItemName}=require('../src/lib/soulmate-product-names');
 const cart=buildSoulmateCart('standard',['description','colour','priority']);
 row.snapshot.items=cart.lineItems;
 const before=JSON.stringify(row.snapshot.items);
 const email=soulmateConfirmationEmail(row);
 assert.doesNotMatch(email.html,/\[RECOMMENDED\]|\[POPULAR\]/i);
 assert.doesNotMatch(email.text,/\[RECOMMENDED\]|\[POPULAR\]/i);
 assert.match(email.text,/Soulmate Description: When&Where, Initials, Traits, Job/);
 assert.match(email.text,/Priority Delivery - receive sketch within 12 hours instead of 48/);
 for(const item of cart.lineItems) assert.doesNotMatch(soulmateReceiptItemName(item),/\[RECOMMENDED\]|\[POPULAR\]/i);
 assert.equal(JSON.stringify(row.snapshot.items),before);
});

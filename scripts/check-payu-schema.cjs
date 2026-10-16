// Read-only deployment preflight. Uses configured Supabase credentials, returns
// no customer rows, and verifies the actual columns needed for checkout recovery.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const { normalizeBirthDetailsSnapshot, birthSnapshotToDbFields, birthSnapshotToUserDbFields } = require('../src/lib/birth-details');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const sample = normalizeBirthDetailsSnapshot({gender:'male',relationshipStatus:'single',birthMonth:'May',birthDay:'12',birthYear:'1994',birthHour:'10',birthMinute:'30',birthPeriod:'AM',birthPlace:'Delhi',knowsBirthTime:true,timezone:'Asia/Kolkata',sunSign:'Taurus',moonSign:'Aries',ascendantSign:'Leo'}, 'schema_preflight');
const checks = [];
for (const file of ['src/lib/payu-fulfillment.ts','src/lib/payment-reconciliation.ts','src/lib/payu-checkout-user.ts','src/app/api/payu/status/route.ts']) {
 const source = fs.readFileSync(path.join(__dirname,'..',file),'utf8');
 for (const match of source.matchAll(/\.from\("([a-z_]+)"\)\s*\.select\(\s*"([^"]+)"\s*\)/g)) {
  if (match[2] !== '*') checks.push({label:file,table:match[1],columns:match[2]});
 }
}
checks.push({label:'profile birth writes',table:'user_profiles',columns:['id','email','updated_at',...Object.keys(birthSnapshotToDbFields(sample))].join(',')});
checks.push({label:'user entitlement and birth writes',table:'users',columns:['id','unlocked_features','coins','payment_status','purchase_type','updated_at','payu_payment_id','payu_txn_id','bundle_purchased','whatsapp_number','whatsapp_opt_in','whatsapp_opt_in_at','whatsapp_opt_in_source',...Object.keys(birthSnapshotToUserDbFields(sample))].join(',')});
checks.push({label:'payment completion writes',table:'payments',columns:'id,payu_txn_id,payu_payment_id,user_id,type,bundle_id,feature,coins,customer_email,payment_status,meta_purchase_queued_at,amount,fulfilled_at,birth_details_snapshot'});
(async()=>{
 assert.ok(checks.length >= 10, 'Expected checkout schema checks were not discovered');
 for (const check of checks) {
  const {error} = await db.from(check.table).select(check.columns).limit(0);
  if (error) throw new Error(`${check.label} (${check.table}): ${error.code} ${error.message}`);
 }
 console.log(`PASS: ${checks.length} live schema checks; no customer rows read or written.`);
})().catch(error=>{console.error(error.message);process.exitCode=1});

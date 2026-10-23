// Explicit, one-recipient preview. Never call the automatic worker from this script.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
require('dotenv').config({ path: '.env.production.local', quiet: true });
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...rest) { return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, parent, ...rest); };
const { createClient } = require('@supabase/supabase-js');
const { prepareSoulmateWhatsApp, dispatchSoulmateWhatsApp } = require('../src/lib/soulmate-whatsapp');
const dir = path.join(__dirname, '../output/whatsapp');
const filename = path.join(dir, 'anay-preview-ledger.json');
const lock = filename + '.lock';
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
async function main() {
  if (!process.argv.includes('--send-to-anay')) throw new Error('Explicit --send-to-anay flag required');
  fs.mkdirSync(dir, { recursive: true });
  const fd = fs.openSync(lock, 'wx', 0o600);
  try {
    const result = await db.from('soulmate_orders').select('id').eq('customer_email', 'tripathy.anay@gmail.com').eq('payment_status', 'paid').single();
    if (result.error || !result.data) throw new Error('Expected exactly one paid Anay order');
    const { order, documents } = await prepareSoulmateWhatsApp(db, result.data.id);
    if (order.customer_phone !== '919131695346') throw new Error('Preview recipient mismatch');
    const state = fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : { orderId: order.id, messages: {} };
    if (state.orderId !== order.id) throw new Error('Preview order mismatch');
    const save = () => { fs.writeFileSync(filename + '.tmp', JSON.stringify(state, null, 2), { mode: 0o600 }); fs.renameSync(filename + '.tmp', filename); };
    const ledger = {
      async claim(kind) {
        const previous = state.messages[kind]?.status;
        if (previous === 'accepted') return 'accepted';
        if (previous) return 'blocked';
        state.messages[kind] = { status: 'submitting', submittedAt: new Date().toISOString() }; save(); return 'claimed';
      },
      async accepted(kind, providerId) { Object.assign(state.messages[kind], { status: 'accepted', providerId, acceptedAt: new Date().toISOString() }); save(); },
      async uncertain(kind) { state.messages[kind].status = 'needs_review'; save(); },
    };
    console.log(JSON.stringify(await dispatchSoulmateWhatsApp(order, documents, ledger), null, 2));
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

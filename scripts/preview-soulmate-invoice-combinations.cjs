// Offline previews only: no database, payment, storage or email calls.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, parent, ...rest) {
  return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, parent, ...rest);
};
const { buildSoulmateCart } = require('../src/lib/soulmate-cart');
const { generateSoulmateInvoicePdf } = require('../src/lib/soulmate-invoice-template');
const cases = [
 ['standard', [], 'Soulmate Sketch only'],
 ['standard', ['description'], 'Sketch + Description'],
 ['standard', ['colour'], 'Sketch + Color Upgrade'],
 ['standard', ['priority'], 'Sketch + Priority Delivery'],
 ['standard', ['description', 'colour'], 'Sketch + Description + Color Upgrade'],
 ['standard', ['description', 'priority'], 'Sketch + Description + Priority Delivery'],
 ['standard', ['colour', 'priority'], 'Sketch + Color Upgrade + Priority Delivery'],
 ['standard', ['description', 'colour', 'priority'], 'Sketch + All Three Add-ons'],
 ['express', [], 'Complete Soulmate Vision only'],
 ['express', ['timeline'], 'Complete Soulmate Vision + Connection Timeline'],
];
const dir = path.join(__dirname, '../output/pdf/soulmate-invoice-combinations');
fs.mkdirSync(dir, { recursive: true });
const issued = '2026-10-15T13:30:00.000Z';
const manifest = cases.map(([plan, extras, title], i) => {
 const cart = buildSoulmateCart(plan, extras);
 const id = String(i + 1).padStart(2, '0');
 const invoice = {
  invoice_number: `ARS-PREVIEW-${id}`, issued_at: issued,
  snapshot: {
   customerName: 'Anay Tripathy', customerEmail: 'tripathy.anay@gmail.com', orderId: null,
   items: cart.lineItems, entitlements: cart.entitlements,
   subtotal: cart.baseAmount, gst: cart.gstAmount, total: cart.amount,
   paidAt: null, deliveryDueAt: null,
  },
 };
 const filename = `${id}-${plan}-${extras.join('-') || 'only'}`;
 fs.writeFileSync(path.join(dir, `${filename}.pdf`), generateSoulmateInvoicePdf(invoice));
 return { id, title, filename, plan, extras, subtotal: cart.baseAmount, gst: cart.gstAmount, total: cart.amount, deliveryHours: cart.entitlements.promised_hours };
});
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));

const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node',jsx:'react-jsx'}});
const resolve=Module._resolveFilename;Module._resolveFilename=function(n,p,...args){return resolve.call(this,n.startsWith('@/')?path.join(__dirname,'../src',n.slice(2)):n,p,...args)};
const React=require('react'),{create,act}=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
global.sessionStorage={getItem:()=>null,setItem:()=>{}};
for(const market of ['', 'soulmate/', 'us-main/', 'us-soulmate/'])test(`${market||'main/'}campaign details do not refetch on live-sales rerenders or failed requests`,async()=>{
 const base=`../src/app/(app)/admin/${market}tracking/`;
 for(const name of ['TrackingBudgetDialog','TrackingBidDialog']){const id=require.resolve(base+name);require.cache[id]={id,filename:id,loaded:true,exports:{__esModule:true,default:()=>null}}}
 const Rows=require(base+'TrackingCampaignRows').default;
 const row={key:'campaign',accountId:'123456',campaignId:'111111',campaignName:'Fixture',accountName:'Fixture',currency:'INR',orders:0,adBreakdown:[],utmSources:[],utmMediums:[],utmTerms:[],utmContents:[]};
 let calls=0;global.fetch=async()=>{calls++;return Response.json({error:'Meta reporting is temporarily rate limited'},{status:429})};
 const props={rows:[row],columns:[],token:'admin-fixture',dates:{start:'2026-11-16',end:'2026-11-16'},dayMode:'calendar_ist',refreshKey:'first',activeOnly:false,activeScope:'all',onMetaEditSaved:()=>{}};
 let root;await act(async()=>{root=create(React.createElement(Rows,props))});
 await act(async()=>{root.root.findByProps({'aria-label':'Expand Fixture'}).props.onClick({stopPropagation(){}})});assert.equal(calls,1);
 for(let i=0;i<5;i++)await act(async()=>root.update(React.createElement(Rows,{...props,dates:{...props.dates},rows:[{...row,orders:i}]})));
 assert.equal(calls,1,'live sales and new date objects must not trigger another provider request');
 global.fetch=async()=>{calls++;return Response.json({adsets:[],ads:[]})};
 await act(async()=>root.update(React.createElement(Rows,{...props,refreshKey:'manual-refresh'})));assert.equal(calls,2);
 await act(async()=>root.update(React.createElement(Rows,{...props,refreshKey:'manual-refresh',dates:{...props.dates}})));assert.equal(calls,2);
 await act(async()=>root.unmount());
});
test('retired marketing routes cannot send emails, sync lists or read profiles',async()=>{
 const originalFetch=global.fetch;let calls=0;global.fetch=async()=>{calls++;throw Error('No external requests allowed')};
 try {
  for(const [route,method] of [['track-event','POST'],['cron/daily-horoscope-email','GET'],['user/restore-session','GET']]){
   const handler=require('../src/app/api/'+route+'/route')[method];
   const response=await handler(new Request('http://localhost/api/'+route));assert.equal(response.status,410);
  }
  assert.equal(calls,0);
  const fs=require('node:fs');
  const cron=JSON.parse(fs.readFileSync(path.join(__dirname,'../vercel.json'),'utf8'));
  assert.ok(!cron.crons.some(item=>item.path==='/api/cron/daily-horoscope-email'));
  const checkout=fs.readFileSync(path.join(__dirname,'../src/app/(onboarding)/onboarding/bundle-pricing/page.tsx'),'utf8');
  assert.ok(!checkout.includes('/api/track-event'));
  assert.ok(checkout.includes('pixelEvents.addToCart(plan.price, plan.name)'));
  assert.ok(checkout.includes('/api/payments/initiate'));
  const brevo=require('../src/lib/brevo');
  for(const name of ['upsertContact','addContactToList','removeContactFromList','trackEvent','BREVO_LISTS','BREVO_TEMPLATES']) assert.equal(brevo[name],undefined);
  assert.equal(typeof brevo.sendEmail,'function');assert.equal(typeof brevo.sendEmailWithAttachments,'function');
 } finally {global.fetch=originalFetch}
});

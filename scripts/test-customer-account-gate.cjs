const assert=require('node:assert/strict'),Module=require('node:module'),path=require('node:path');
const resolve=Module._resolveFilename,load=Module._load;
Module._resolveFilename=function(name,...rest){return resolve.call(this,name.startsWith('@/')?path.join(__dirname,'../src',name.slice(2)):name,...rest)};
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node',jsx:'react-jsx'}});
const React=require('react'),{create,act}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
let pathname='/reports',blocked=false,blockWrites=false,storage=new Map(),events={},requests=[],serverUser={id:'owner',email:'owner@example.invalid',coins:7,bundle_purchased:'palm-birth',unlocked_features:{palmReading:true,birthChart:true}};
global.localStorage={getItem:k=>{if(blocked)throw Error('blocked');return storage.get(k)||null},setItem:(k,v)=>{if(blocked||blockWrites)throw Error('blocked');storage.set(k,v)},removeItem:k=>{if(blocked||blockWrites)throw Error('blocked');storage.delete(k)},clear:()=>storage.clear()};
global.window={localStorage:global.localStorage,location:{pathname,search:''},addEventListener:(n,f)=>events[n]=f,removeEventListener:n=>delete events[n]};global.document={visibilityState:'visible',addEventListener:(n,f)=>events[n]=f,removeEventListener:n=>delete events[n]};
Module._load=function(name,...rest){if(name==='next/navigation')return {usePathname:()=>pathname};if(name==='next/link')return {__esModule:true,default:({children,...props})=>React.createElement('a',props,children)};return load.call(this,name,...rest)};
const Gate=require('../src/components/UserHydrator').default,{useUserStore}=require('../src/lib/user-store'),session=require('../src/lib/session-recovery'),hints=require('../src/lib/session-storage');Module._load=load;
let response=()=>Promise.resolve(Response.json({user:serverUser}));global.fetch=(url)=>{requests.push(url);assert.equal(url,'/api/auth/session','restoration must not call fulfillment or tracking');return response()};
let rendered=[];function Report(){const state=useUserStore.getState();rendered.push({id:state.userId,coins:state.coins,paid:state.unlockedFeatures.palmReading});return React.createElement('span',null,'Saved report for '+state.userId)}
const view=()=>React.createElement(Gate,null,React.createElement(Report));const text=t=>JSON.stringify(t.toJSON());
(async()=>{
 storage.set('astrorekha_user_id','wrong-browser-id');useUserStore.getState().setUserId('wrong-browser-id');useUserStore.getState().setCoins(999);session.clearCustomerSessionCache();
 let release;response=()=>new Promise(r=>release=r);let tree;await act(async()=>{tree=create(view())});assert.equal(rendered.length,0);assert.match(text(tree),/Loading your account/);
 await act(async()=>release(Response.json({user:serverUser})));assert.deepEqual(rendered[0],{id:'owner',coins:7,paid:true});assert.equal(hints.readSessionHint('astrorekha_user_id'),'owner');await act(()=>tree.unmount());
 blocked=true;session.clearCustomerSessionCache();response=async()=>Response.json({user:serverUser});rendered=[];await act(async()=>{tree=create(view())});assert.equal(rendered[0].id,'owner');assert.equal(hints.readSessionHint('astrorekha_user_id'),'owner');await act(()=>tree.unmount());blocked=false;
 // Storage can reject writes while still returning the old account ID.
 blockWrites=true;storage.set('astrorekha_user_id','stale');hints.saveLoginUserId('owner');assert.equal(hints.readSessionHint('astrorekha_user_id'),'owner');blockWrites=false;
 session.clearCustomerSessionCache();response=async()=>new Response('{}',{status:503});rendered=[];await act(async()=>{tree=create(view())});assert.equal(rendered.length,0);assert.match(text(tree),/purchases and saved reports have not changed/);assert.equal(useUserStore.getState().coins,7);
 response=async()=>Response.json({user:serverUser});await act(async()=>tree.root.findByType('button').props.onClick());assert.match(text(tree),/Saved report for owner/);
 response=async()=>new Response('{}',{status:401});await act(async()=>events.visibilitychange());assert.match(text(tree),/Sign in to your reports/);assert.equal(useUserStore.getState().userId,null);await act(()=>tree.unmount());
 // Public/payment/admin pages must not acquire a customer-session dependency.
 pathname='/admin/revenue';requests=[];await act(async()=>{tree=create(view())});assert.equal(requests.length,0);await act(()=>tree.unmount());
 pathname='/reports';session.clearCustomerSessionCache();serverUser={id:'second-owner',coins:0,unlocked_features:{}};response=async()=>Response.json({user:serverUser});rendered=[];await act(async()=>{tree=create(view())});assert.deepEqual(rendered[0],{id:'second-owner',coins:0,paid:false});assert.equal(useUserStore.getState().purchasedBundle,null);await act(()=>tree.unmount());
 console.log('PASS: account-before-render, fresh/blocked storage, failed-write fallback, outage retry, expired session, separate account grants, non-customer bypass; no payment or analytics requests');
})().catch(e=>{console.error(e);process.exitCode=1});

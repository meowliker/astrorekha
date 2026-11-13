const {test}=require('node:test');const assert=require('node:assert/strict');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const {reportSource,reportWorkspaceUrl}=require('../src/lib/admin-report-workspace');
const {workspaceForPath,canAccess}=require('../src/lib/admin-workspaces');
test('normal workspaces remain Meta and Google navigation remains in its workspace',()=>{
 assert.equal(reportSource('/admin/revenue'),'meta');assert.equal(reportSource('/admin/google/astrorekha/revenue'),'google');
 assert.equal(reportWorkspaceUrl('/admin/orders?date=2026-11-13','google'),'/admin/google/astrorekha/orders?date=2026-11-13');
 assert.equal(reportWorkspaceUrl('/admin/soulmate/orders/order-one','google'),'/admin/google/soulmate/orders/order-one');
 assert.equal(reportWorkspaceUrl('/api/admin/orders','google'),'/api/admin/orders');
 assert.equal(reportWorkspaceUrl('/admin','google'),'/admin/google');
});
test('Google reports inherit the underlying funnel permissions',()=>{
 const staff={isAdministrator:false,workspaces:['astrorekha']};
 assert.equal(canAccess(staff,workspaceForPath('/admin/google/astrorekha/revenue')),true);
 for(const path of ['/admin/google/us-main/revenue','/admin/google/us-soulmate/orders','/admin/google/soulmate/profit','/admin/google/other/revenue'])assert.equal(canAccess(staff,workspaceForPath(path)),false,path);
});

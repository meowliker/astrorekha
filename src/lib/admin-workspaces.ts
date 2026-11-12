export const WORKSPACES = {astrorekha:'AstroRekha', 'us-main':'US AstroRekha', soulmate:'Soulmate', 'us-soulmate':'US Soulmate', operations:'Operations'} as const;
export type Workspace = keyof typeof WORKSPACES;
export type AdminAccess = {id:string;name:string;isAdministrator:boolean;workspaces:Workspace[]};
export function workspaceForPath(path:string):Workspace|'administrator'|null {
 if(path==='/admin'||path==='/admin/login'||path==='/api/admin/session'||path==='/api/admin/logout')return null;
 if(/^\/(?:api\/)?admin\/access(?:\/|$)/.test(path))return 'administrator';
 for(const key of ['us-main','us-soulmate','soulmate'] as const)if(new RegExp(`^/(?:api/)?admin/${key}(?:/|$)`).test(path))return key;
 if(/^\/(?:api\/)?admin\/(?:monitoring|analytics-access|payment-gateway|backfill|sync-sheets)/.test(path)||path==='/support')return 'operations';
 return 'astrorekha';
}
export function canAccess(access:AdminAccess,workspace:ReturnType<typeof workspaceForPath>){return access.isAdministrator||workspace===null||(workspace!=='administrator'&&access.workspaces.includes(workspace));}

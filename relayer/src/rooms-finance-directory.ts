import type {Pool} from 'pg';
import type {PublicClient} from 'viem';
import {createRoomsFinanceRouter} from './rooms-finance-router';
import type {RoomsFinanceManifest} from './rooms-finance-config';
/** Financial references survive a game deployment. Authentication still belongs to the current account. */
export async function createRoomsFinanceDirectory(o:{db:Pool;base:PublicClient;entries:RoomsFinanceManifest[];app:string;enqueue:Parameters<typeof createRoomsFinanceRouter>[0]['enqueue']}){
 const routers=new Map<string,Awaited<ReturnType<typeof createRoomsFinanceRouter>>>();
 for(const app of new Set(o.entries.map(m=>m.app.toLowerCase())))routers.set(app,await createRoomsFinanceRouter({...o,entries:o.entries.filter(m=>m.app.toLowerCase()===app)}));
 const active=routers.get(o.app.toLowerCase());if(!active)throw new Error('Current finance deployment missing');
 return {...active,
  audit:async()=>{for(const router of routers.values())await router.audit();},
  route:async(path:string,method:string,player:string,body:any,params:URLSearchParams)=>{
   const app=String((method==='GET'?params.get('app'):body.app)||o.app).toLowerCase();
   const selected=routers.get(app);if(!selected)throw new Error('Unknown financial application');
   const result=await selected.route(path,method,player,body,params);
   if(path==='/interlude/finance'&&method==='GET'&&result){
    const archives=[...(result.archives||[])];
    for(const router of routers.values())if(router!==selected){const v=await router.route(path,method,player,{},new URLSearchParams());if(v)archives.push({...v,archives:undefined},...(v.archives||[]));}
    return {...result,archives};
   }return result;
  },
 };
}

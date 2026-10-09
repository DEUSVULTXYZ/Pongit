import {API} from './api';

/** Events only invalidate public contract views. Existing bounded polling is
 * retained when EventSource is unavailable, disconnected or rejected. */
export type AgentChanges={resync:boolean;changed:string[]};
export function watchAgentChanges(refresh:(changes:AgentChanges)=>void,account?:string,scope?:'arcade'|'tournaments'|'challenge'){
 if(typeof EventSource==='undefined')return()=>{};
 const query=new URLSearchParams();if(account)query.set('account',account);if(scope)query.set('scope',scope);
 const stream=new EventSource(`${API}/agents/events${query.size?`?${query}`:''}`);
 let timer:ReturnType<typeof setTimeout>|undefined,closed=false,last='',resync=false;
 const changed=new Set<string>();
 stream.addEventListener('change',event=>{
  try{
   const value=JSON.parse((event as MessageEvent).data);
   if(value.version!==1||!Array.isArray(value.changed)||!value.changed.every((v:unknown)=>typeof v==='string')||!value.revisions)return;
   const revision=JSON.stringify(value.revisions);if(!value.resync&&revision===last)return;last=revision;
   resync ||= value.resync===true;for(const topic of value.changed)changed.add(topic);
   // Coalesce topics without losing an earlier challenge notification to a
   // later catalogue update. Do not postpone delivery indefinitely under load.
   if(!timer)timer=setTimeout(()=>{timer=undefined;if(!closed){const batch={resync,changed:[...changed]};resync=false;changed.clear();refresh(batch);}},100);
  }catch{/* Invalid notifications never replace state or stop polling. */}
 });
 return()=>{closed=true;clearTimeout(timer);stream.close();};
}

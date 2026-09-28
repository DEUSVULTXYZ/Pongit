import {API} from './api';

/** Events only invalidate public contract views. Existing bounded polling is
 * retained when EventSource is unavailable, disconnected or rejected. */
export function watchAgentChanges(refresh:()=>void,account?:string){
 if(typeof EventSource==='undefined')return()=>{};
 const stream=new EventSource(`${API}/agents/events${account?`?account=${encodeURIComponent(account)}`:''}`);
 let timer:ReturnType<typeof setTimeout>|undefined,closed=false,last='';
 stream.addEventListener('change',event=>{
  try{
   const value=JSON.parse((event as MessageEvent).data);
   if(value.version!==1||!Array.isArray(value.changed)||!value.revisions)return;
   const revision=JSON.stringify(value.revisions);if(!value.resync&&revision===last)return;last=revision;
   clearTimeout(timer);timer=setTimeout(()=>{if(!closed)refresh();},100);
  }catch{/* Invalid notifications never replace state or stop polling. */}
 });
 return()=>{closed=true;clearTimeout(timer);stream.close();};
}

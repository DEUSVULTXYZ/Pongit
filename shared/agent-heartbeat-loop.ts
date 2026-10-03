type Clock={every:(fn:()=>void,ms:number)=>unknown;clear:(id:unknown)=>void};
/** A single liveness pulse may be outstanding. Callers retain perception and
 * visibility checks; stopping the loop never abandons a command's journal. */
export function agentHeartbeatLoop(pulse:()=>Promise<unknown>,eligible:()=>boolean,onError:(e:unknown)=>void,
 clock:Clock={every:(fn,ms)=>setInterval(fn,ms),clear:id=>clearInterval(id as ReturnType<typeof setInterval>)}){
 let stopped=false,pending:Promise<unknown>|undefined;
 const poke=()=>{
  if(stopped||pending||!eligible())return;
  pending=Promise.resolve().then(()=>{if(!stopped&&eligible())return pulse();}).catch(e=>{if(!stopped)onError(e);}).finally(()=>{pending=undefined;});
 };
 const timer=clock.every(poke,200);
 poke();
 return{poke,async stop(){stopped=true;clock.clear(timer);await pending;}};
}

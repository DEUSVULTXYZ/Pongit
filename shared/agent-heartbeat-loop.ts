type Clock={every:(fn:()=>void,ms:number)=>unknown;clear:(id:unknown)=>void};
/** A single liveness pulse may be outstanding. Callers retain perception and
 * visibility checks; stopping the loop never abandons a command's journal. */
export function agentHeartbeatLoop(pulse:()=>Promise<unknown>,eligible:()=>boolean,onError:(e:unknown)=>void,
 clock:Clock={every:(fn,ms)=>setInterval(fn,ms),clear:id=>clearInterval(id as ReturnType<typeof setInterval>)}){
 let stopped=false,due=false,pending:Promise<unknown>|undefined;
 const poke=()=>{
  if(stopped||!eligible())return;
  if(pending){due=true;return;}
  due=false;
  pending=Promise.resolve().then(()=>{if(!stopped&&eligible())return pulse();}).catch(e=>{due=false;if(!stopped)onError(e);}).finally(()=>{
   pending=undefined;
   // A receipt plus its authoritative gap read can outlive the 200ms timer.
   // Skipping that tick and waiting for the next adds up to another 200ms,
   // exhausting the contract's 500ms credit on an otherwise healthy channel.
   // Coalesce missed ticks into one pulse, still with one command in flight.
   if(due)poke();
  });
 };
 const timer=clock.every(poke,200);
 poke();
 return{poke,async stop(){stopped=true;clock.clear(timer);await pending;}};
}

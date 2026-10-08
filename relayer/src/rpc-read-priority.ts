/** An identical in-flight read shares its result and its most urgent reader.
 * This only promotes work still queued; it never repeats an upstream request. */
export function rpcReadPriority(initial:boolean){
 let foreground=initial;
 const listeners=new Set<()=>void>();
 return {
  foreground:()=>foreground,
  promote(){if(foreground)return;foreground=true;for(const notify of listeners)notify();},
  subscribe(notify:()=>void){listeners.add(notify);if(foreground)notify();return()=>{listeners.delete(notify);};},
 };
}
export type RpcReadPriority=ReturnType<typeof rpcReadPriority>;

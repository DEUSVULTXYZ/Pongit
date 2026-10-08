import type {AgentKeeperRole} from './agent-keeper-role';

/** Player admission uses the existing gateway foreground lane. Archives and
 * maintenance retain normal scheduling, including when the gateway coalesces
 * their reads. The hint never changes the RPC, pacing or signing authority. */
export function keeperRpcFetch(role:AgentKeeperRole|'legacy',fetcher:typeof fetch):typeof fetch{
 if(role!=='admission')return fetcher;
 return(input,init)=>{
  const headers=new Headers(init?.headers??(input instanceof Request?input.headers:undefined));
  headers.set('x-pongit-rpc-foreground','1');
  return fetcher(input,{...init,headers});
 };
}

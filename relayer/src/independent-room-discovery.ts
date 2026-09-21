import type {Abi,Address,PublicClient} from 'viem';

/** Current room IDs are hints, not authority. Historical indexing retains its
 * own durable cursor; its backlog must not delay newly joined players. The
 * overlapping head window also rediscovers logs after a short interruption.
 * Admission always rereads the contract and simulates propose before writing. */
export function independentRoomDiscovery(base:PublicClient,lobby:Address,abi:Abi,
 remember:(room:bigint)=>Promise<void>){
 return async()=>{
  const head=await base.getBlockNumber();
  // The shared Monad endpoint accepts at most 100 blocks per log request.
  const logs=await base.getContractEvents({address:lobby,abi,fromBlock:head>99n?head-99n:0n,toBlock:head});
  const rooms=new Set<bigint>();
  for(const log of logs){
   if(log.removed||log.address.toLowerCase()!==lobby.toLowerCase())continue;
   const room=(log.args as {room?:unknown})?.room;
   if(typeof room==='bigint'&&room>0n)rooms.add(room);
  }
  for(const room of rooms)await remember(room);
 };
}

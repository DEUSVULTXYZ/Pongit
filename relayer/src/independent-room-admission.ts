import {zeroAddress,type Address} from 'viem';

type Room={id:bigint;proposal:bigint;winner:Address;members:readonly {away:boolean}[]};
type Options={
 page:(offset:number)=>Promise<bigint[]>;
 room:(id:bigint)=>Promise<Room>;
 propose:(id:bigint)=>Promise<unknown>;
};

/** Recent events accelerate discovery; the durable rotating page prevents
 * missed notifications from starving rooms. Neither path chooses players.
 * The contract still checks availability, blocks, capacity and both consents. */
export function independentRoomAdmission(o:Options){
 const hints=new Set<bigint>();let offset=0;
 function hint(id:bigint){
  if(id<=0n)return;
  hints.add(id);
  if(hints.size>256)hints.delete(hints.values().next().value!);
 }
 async function run(){
  const page=await o.page(offset);offset=page.length===16?offset+16:0;
  const recent=[...hints].slice(0,16);for(const id of recent)hints.delete(id);
  const ids=[...new Set([...recent,...page])];
  // Four readers at most; an empty historic room never causes a simulation.
  // Evaluate each batch before continuing, so a recent eligible room need not
  // wait for a full historical page (or a slow RPC for another room).
  let proposed=0;
  for(let i=0;i<ids.length;i+=4){
   const rooms=await Promise.all(ids.slice(i,i+4).map(id=>o.room(id).catch(()=>null)));
   for(const room of rooms){
    if(!room||!room.id||room.proposal||room.members.filter(m=>!m.away).length<2)continue;
    // Two-player rematches are explicitly requested from the result action.
    if(room.members.length===2&&room.winner!==zeroAddress)continue;
    try{await o.propose(room.id);proposed++;}catch{/* A concurrent contract change is rechecked next time. */}
    if(proposed===2)return; // The lobby has two proposal slots.
   }
  }
 }
 return {hint,run};
}

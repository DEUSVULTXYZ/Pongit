import {decodeFunctionData,type Abi,type Hex} from 'viem';

/** Two relayer commands carry the hub epoch they were made for, and the
 * contract rejects them in any other one, before any simulation:
 * - submitRandomness: the beacon request word filed by ChaosGameFlow.request
 *   holds its epoch in bits 64..95, and verifyRandomness requires it to equal the
 *   hub's current epoch (InvalidBeaconRequest);
 * - submitLivePressure: LivePressure.epoch, which checkPressure requires to equal
 *   the hub's current epoch (InvalidPressure). The relayer signs the market
 *   adapter's matchEpoch, fixed when the match's round was opened.
 *
 * A match resumed in a new epoch from Monad's published state keeps both from
 * the old one. Neither can ever succeed there, yet each would be offered again
 * every 2 s, hold the single writer for a node round trip and mark the match in
 * flight, so the Chaos guard's tick waits behind it, past the 1,030 ms
 * worst-state tolerance, and the match freezes again. Such a command is refused
 * here, before it is signed, queued or counted as in flight. */

/** Bits 64..95 of a beacon request word (ChaosEngine.request). */
export const beaconRequestEpoch=(request:bigint)=>(request>>64n)&0xffff_ffffn;

/** The epoch a command is bound to, or undefined for commands bound to none. */
export function commandEpoch(abi:Abi,data:Hex):bigint|undefined{
 let decoded;try{decoded=decodeFunctionData({abi,data});}catch{return undefined;}
 const fn=abi.find(x=>x.type==='function'&&x.name===decoded.functionName);
 if(fn?.type==='function'&&fn.inputs[0]?.name==='epoch')return BigInt(decoded.args![0] as bigint);
 if(['submitLivePressure','renewActive','admit','cancelAdmission'].includes(decoded.functionName))return BigInt((decoded.args?.[0] as {epoch:bigint}).epoch);
 if(decoded.functionName==='submitRandomness')return beaconRequestEpoch(BigInt(decoded.args?.[1] as bigint));
 return undefined;
}

export const STALE_EPOCH_CODE='ENGINE_STALE_EPOCH';
/** Local refusal; nothing was signed or sent. */
export class StaleEpochCommand extends Error {
 code=STALE_EPOCH_CODE;
 constructor(readonly action:string,readonly commandEpoch:bigint,readonly currentEpoch:bigint){
  super(`${action} is bound to epoch ${commandEpoch}, not the current epoch ${currentEpoch}; it is not sent`);
 }
}
export const isStaleEpochCommand=(error:unknown)=>(error as {code?:unknown})?.code===STALE_EPOCH_CODE;

/** Throws StaleEpochCommand when `data` is bound to another epoch than `current`. */
export function assertCommandEpoch(abi:Abi,data:Hex,current:bigint){
 const epoch=commandEpoch(abi,data);
 if(epoch===undefined)return;
 let action='command';try{action=decodeFunctionData({abi,data}).functionName;}catch{}
 if(epoch!==current)throw new StaleEpochCommand(action,epoch,current);
 // Reusable calls carry an explicit epoch AND the packed beacon's epoch.
 // Checking only the outer field would admit an impossible stale proof.
 if(action==='submitRandomness'){
  const decoded=decodeFunctionData({abi,data}),fn=abi.find(x=>x.type==='function'&&x.name===action);
  const offset=fn?.type==='function'&&fn.inputs[0]?.name==='epoch'?2:1;
  const requestEpoch=beaconRequestEpoch(BigInt(decoded.args![offset] as bigint));
  if(requestEpoch!==current)throw new StaleEpochCommand(action,requestEpoch,current);
 }
}

/** Whether the beacon pump may fetch and submit a proof for this request now.
 * A request of an earlier epoch can never be proven again; see
 * docs/validation/human-chaos-incident-2026-09-18.md for what it means for the
 * match (no new Chaos draw while it is pending). */
export const beaconRequestCurrent=(request:bigint,current:bigint)=>request===0n||beaconRequestEpoch(request)===current;

/** Live pressure is signed with the adapter's matchEpoch; only the current epoch
 * can accept it. 0 means no round yet: the relayer opens one in this epoch. */
export const livePressureEpochUsable=(matchEpoch:bigint,current:bigint)=>matchEpoch===0n||matchEpoch===current;

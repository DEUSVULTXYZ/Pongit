import type {Hex} from 'viem';
import type {AgentPoolManifest} from './agent-pool';
import type {AgentMatchRef} from './agents';
import {hubHasNoLease} from './hub-lease';
import type {readHubDelegation} from './rooms-hub';

/** A short-lived canonical observation, never a wallet or gameplay permission.
 * Its deadline is charged from both the read start and the receipt block time.
 * Navigation and recovery cannot renew it. Only the current no-lease rules use
 * this optimization; live identity, binding, permission and nonce recovery stay
 * mandatory in createPoolPlayer. */
export type AgentEntryObservation={
 ref:AgentMatchRef;hub:string;runtimeHash:Hex;blockHash:Hex;timestamp:bigint;
 observedAt:number;validUntil:number;chainId:number;
 delegation:Awaited<ReturnType<typeof readHubDelegation>>;
};
export function usableEntryObservation(value:AgentEntryObservation|undefined,m:AgentPoolManifest,ref:AgentMatchRef,now:number){
 const arena=m.arenas.find(a=>a.app.toLowerCase()===ref.app.toLowerCase());
 if(!value||m.version!==5||m.rulesVersion!==17||!arena||value.chainId!==10143||ref.chainId!==10143
  ||value.hub.toLowerCase()!==m.hub.toLowerCase()||value.runtimeHash!==arena.runtimeHash
  ||value.ref.chainId!==ref.chainId||value.ref.app.toLowerCase()!==ref.app.toLowerCase()
  ||value.ref.epoch!==ref.epoch||value.ref.id!==ref.id||!/^0x[0-9a-fA-F]{64}$/.test(value.blockHash)
  ||value.delegation.status!==1||value.delegation.epoch!==BigInt(ref.epoch)
  ||!hubHasNoLease(m.hub,value.delegation.expiresAt)
  ||!Number.isFinite(value.observedAt)||!Number.isFinite(value.validUntil)
  ||now<value.observedAt||now>=value.validUntil||value.validUntil>value.observedAt+3000
  ||Number(value.timestamp)*1000>now||value.validUntil>Number(value.timestamp)*1000+3000)return null;
 return value;
}

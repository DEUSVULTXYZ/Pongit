import {agentPublicationHealth} from './agent-publication-health';

export type HostedArenaExpectation={app:string;epoch:bigint;chainId:number;baseBlock:bigint;rulesVersion:bigint;runtimeHash:string};
export type HostedArenaEvidence={session:unknown;rulesVersion:bigint;runtimeHash:string;health:unknown};

/** A reachable origin is not an identity or publication certificate. The code
 * hash must come from the canonical base-chain read at the observation block. */
export function verifyHostedArenaEvidence(expected:HostedArenaExpectation,evidence:HostedArenaEvidence,options?:{observePausedPublication?:boolean}){
 const s=evidence.session as Record<string,unknown>;
 const integer=(v:unknown)=>{
  if(typeof v!=='string'&&typeof v!=='number'&&typeof v!=='bigint')throw Error('Hosted arena identity is incomplete');
  if(typeof v==='number'&&!Number.isSafeInteger(v))throw Error('Hosted arena identity is imprecise');
  return BigInt(v);
 };
 if(!s||typeof s.app!=='string'||s.app.toLowerCase()!==expected.app.toLowerCase()
  ||integer(s.epoch)!==expected.epoch||integer(s.chainId)!==BigInt(expected.chainId)||integer(s.baseBlock)!==expected.baseBlock
  ||evidence.rulesVersion!==expected.rulesVersion||!/^0x[0-9a-f]{64}$/i.test(expected.runtimeHash)
  ||evidence.runtimeHash.toLowerCase()!==expected.runtimeHash.toLowerCase())throw Error('Hosted arena identity does not match the canonical delegation');
 const publication=agentPublicationHealth(evidence.health,expected.app,expected.epoch);
 if(!publication.healthy&&!options?.observePausedPublication)throw Error('Hosted arena publication is unavailable');
 return {chainId:expected.chainId,baseBlock:String(expected.baseBlock),rulesVersion:String(expected.rulesVersion),
  runtimeHash:expected.runtimeHash,committedBatches:publication.committedBatches,publicationReady:publication.healthy};
}

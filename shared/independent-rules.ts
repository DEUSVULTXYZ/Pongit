import type {IndependentManifest} from './independent';
import {abi as legacyArena} from './abi-independent-IndependentArena';
import {abi as legacyLobby} from './abi-independent-IndependentLobby';
import {abi as legacySettlement} from './abi-independent-IndependentSettlement';
import {abi as legacyMarket} from './abi-independent-MarketV4';
import {abi as eventsArena} from './abi-independent-IndependentEventsArena';
import {abi as readyArena} from './abi-independent-ReadyIndependentEventsArena';
import {abi as readyLobby} from './abi-independent-ReadyIndependentEventsLobby';
import {abi as eventsLobby} from './abi-independent-IndependentEventsLobby';
import {abi as eventsSettlement} from './abi-independent-IndependentEventsSettlement';
import {abi as eventsMarket} from './abi-independent-RealtimeMarket';
import {abi as reusableArena} from './abi-independent-ReusableEventsArena';
import {abi as reusableLobby} from './abi-independent-ReusableEventsLobby';
import {abi as reusableSettlement} from './abi-independent-ReusableEventsSettlement';

/** An old address retains its old ABI and signature domain. Never infer rules
 * from a familiar function name or overwrite a historical deployment decoder. */
export function independentRules(m:Pick<IndependentManifest,'rulesVersion'>){
 const version=m.rulesVersion??4;
 if(version!==4&&version!==12&&version!==13&&version!==14)throw Error('Unsupported independent rules');
 if(version===14)return {version,events:true,arena:reusableArena,lobby:reusableLobby,settlement:reusableSettlement,
  market:eventsMarket,permissionDomain:'PONGIT Reusable Arena'} as const;
 return version!==4
  ?{version,events:true,arena:version===13?readyArena:eventsArena,lobby:version===13?readyLobby:eventsLobby,settlement:eventsSettlement,market:eventsMarket,permissionDomain:'PONGIT Pooled Arena'} as const
  :{version,events:false,arena:legacyArena,lobby:legacyLobby,settlement:legacySettlement,market:legacyMarket,permissionDomain:'PONGIT Arena Revocation'} as const;
}

/** Every reusable control and its receipt must retain the epoch on the wire.
 * Legacy UI lanes still express their logical match first; convert once at
 * the transport boundary and use the same arguments for receipt decoding. */
export function independentControlArgs(version:number,epoch:bigint,args:readonly unknown[]){
 if(version!==14)return args;
 if(epoch<=0n||typeof args[0]!=='bigint'||args[0]<=0n)throw Error('Reusable control needs its epoch and logical match');
 return [epoch,...args];
}

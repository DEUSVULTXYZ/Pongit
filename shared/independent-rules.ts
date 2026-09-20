import type {IndependentManifest} from './independent';
import {abi as legacyArena} from './abi-independent-IndependentArena';
import {abi as legacyLobby} from './abi-independent-IndependentLobby';
import {abi as legacySettlement} from './abi-independent-IndependentSettlement';
import {abi as legacyMarket} from './abi-independent-MarketV4';
import {abi as eventsArena} from './abi-independent-IndependentEventsArena';
import {abi as eventsLobby} from './abi-independent-IndependentEventsLobby';
import {abi as eventsSettlement} from './abi-independent-IndependentEventsSettlement';
import {abi as eventsMarket} from './abi-independent-RealtimeMarket';

/** An old address retains its old ABI and signature domain. Never infer rules
 * from a familiar function name or overwrite a historical deployment decoder. */
export function independentRules(m:Pick<IndependentManifest,'rulesVersion'>){
 const version=m.rulesVersion??4;
 if(version!==4&&version!==12)throw Error('Unsupported independent rules');
 return version===12
  ?{version,events:true,arena:eventsArena,lobby:eventsLobby,settlement:eventsSettlement,market:eventsMarket,permissionDomain:'PONGIT Pooled Arena'} as const
  :{version,events:false,arena:legacyArena,lobby:legacyLobby,settlement:legacySettlement,market:legacyMarket,permissionDomain:'PONGIT Arena Revocation'} as const;
}

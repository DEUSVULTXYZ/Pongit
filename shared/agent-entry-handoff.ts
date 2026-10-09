import type {Address} from 'viem';
import type {AgentMatchRef} from './agents';
import type {AgentPoolManifest,PoolMatchView} from './agent-pool';

/** Tab-memory only, one exact participant/reference, ten seconds maximum.
 * No wallet, signature or control permission is retained. F5 uses ordinary API
 * hydration. A failed/stale handoff never manufactures a new challenge. */
export function createAgentEntryHandoff(now:()=>number=()=>performance.now()){
 let saved:{config:AgentPoolManifest;view:PoolMatchView;player:Address;at:number}|undefined;
 return{
  put(config:AgentPoolManifest,view:PoolMatchView,player:Address){
   saved=undefined;
   if(config.version!==5||view.ref.chainId!==config.chainId||view.a.toLowerCase()!==player.toLowerCase()
    ||view.ranked||view.tournament!=='0'||view.result||!view.node||!view.currentBinding
    ||!config.arenas.some(a=>a.app.toLowerCase()===view.ref.app.toLowerCase()&&a.node===view.node))return;
   saved={config:structuredClone(config),view:structuredClone(view),player,at:now()};
  },
  take(ref:AgentMatchRef,player:Address|undefined){
   const entry=saved;saved=undefined;
   if(!entry||!player||entry.player.toLowerCase()!==player.toLowerCase()||now()-entry.at<0||now()-entry.at>10000
    ||entry.view.ref.chainId!==ref.chainId||entry.view.ref.app.toLowerCase()!==ref.app.toLowerCase()
    ||entry.view.ref.epoch!==ref.epoch||entry.view.ref.id!==ref.id)return null;
   return{config:entry.config,view:entry.view};
  },
 };
}

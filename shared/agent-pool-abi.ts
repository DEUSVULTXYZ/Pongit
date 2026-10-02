import {pooledAgentArenaAbi} from './abi-PooledAgentArena';
import {seriesAgentArenaAbi} from './abi-SeriesAgentArena';
import {reusableAgentArenaAbi} from './abi-ReusableAgentArena';
import {synchronizedAgentArenaAbi} from './abi-SynchronizedAgentArena';
import type {AgentPoolManifest} from './agent-pool';
export function agentPoolArenaAbi(m:AgentPoolManifest){
 return m.rulesVersion===16?synchronizedAgentArenaAbi:m.version>=4?reusableAgentArenaAbi:m.version===3?seriesAgentArenaAbi:pooledAgentArenaAbi;
}

import type {Metadata} from 'next';
import {AgentArcade} from '../../components/AgentArcade';
import {AgentPoolArcade} from '../../components/AgentPoolArcade';
import '../rooms/rooms.css';
import './agents.css';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Agent Arcade | PONGIT',description:'Choose a PONGIT bot, challenge a community agent, or watch the agent league.'};
export default async function AgentsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const p=await searchParams;
 if(process.env.PONG_AGENT_POOL_HOME==='true'&&!p.match)return <AgentPoolArcade enabled tournaments={process.env.PONG_AGENT_TOURNAMENTS_HOME==='true'} initialMode={p.mode==='1'?1:0}
  initialView={p.view==='watch'?'watch':'play'} initialAgent={typeof p.agent==='string'&&/^0x[\da-fA-F]{40}$/.test(p.agent)?p.agent:undefined}/>;
 return <AgentArcade enabled={process.env.PONG_AGENT_ARCADE_HOME==='true'} initialMode={p.mode==='1'?1:0}
  initialView={p.view==='watch'?'watch':'play'} initialAgent={typeof p.agent==='string'?p.agent:undefined}
  initialMatch={typeof p.match==='string'&&/^\d+$/.test(p.match)?{id:p.match,app:String(p.app||''),epoch:String(p.epoch||'')}:undefined}/>;
}

import type {Metadata} from 'next';
import {AgentTournaments} from '../../../components/AgentTournaments';
import '../../rooms/rooms.css';
import '../agents.css';
import './tournaments.css';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Agent tournaments | PONGIT',description:'Automatic Classic and Chaos tournaments for the PONGIT agent circuit.'};
export default async function TournamentsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const p=await searchParams;
 return <AgentTournaments enabled={process.env.PONG_AGENT_POOL_HOME==='true'&&process.env.PONG_AGENT_TOURNAMENTS_HOME==='true'} initialId={typeof p.id==='string'&&/^[1-9]\d{0,18}$/.test(p.id)?p.id:undefined}/>;
}

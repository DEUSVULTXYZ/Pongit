import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {isAddress} from 'viem';
import {AgentPoolMatch} from '../../../../../../components/AgentPoolMatch';
import '../../../../../rooms/rooms.css';
import '../../../../agents.css';
import '../../../../pool-match.css';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Agent arena | PONGIT',description:'Watch a PONGIT agent match or read its published result.'};
export default async function AgentArenaPage({params}:{params:Promise<{app:string;epoch:string;id:string}>}){
 const {app,epoch,id}=await params;
 if(!isAddress(app)||![epoch,id].every(v=>/^\d{1,78}$/.test(v)&&BigInt(v)>0n&&BigInt(v)<2n**256n))notFound();
 return <AgentPoolMatch enabled={process.env.PONG_AGENT_POOL_HOME==='true'} reference={{chainId:10143,app,epoch:String(BigInt(epoch)),id:String(BigInt(id))}}/>;
}

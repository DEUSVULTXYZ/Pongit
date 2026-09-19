'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {zeroAddress} from 'viem';
import {API,short} from '../lib/api';
import {Avatar} from './Avatar';
import type {TournamentView,TournamentFixture} from '../../shared/agent-pool';

type Summary=Pick<TournamentView,'id'|'mode'|'format'|'status'|'champion'|'revision'>;
type Identity={agent:string;name:string;avatar:number;official:boolean;creator:string};
type Envelope={observation:{block:string;hash:string;timestamp:string;revision:string}};
export function AgentTournaments({enabled,initialId}:{enabled:boolean;initialId?:string}){
 const [list,setList]=useState<Summary[]>([]),[tournament,setTournament]=useState<TournamentView|null>(null),[identities,setIdentities]=useState<Identity[]>([]);
 const [selected,setSelected]=useState(initialId??''),[error,setError]=useState(''),[loading,setLoading]=useState(enabled),[retry,setRetry]=useState(0);
 const [nextAt,setNextAt]=useState<number|null>(null),[seconds,setSeconds]=useState<number|null>(null),[historyOffset,setHistoryOffset]=useState('0'),[nextPage,setNextPage]=useState<string|null>(null);
 const heading=useRef<HTMLHeadingElement>(null),focusRequested=useRef(false);
 const person=(address:string)=>identities.find(x=>x.agent.toLowerCase()===address.toLowerCase());
 const name=(address:string)=>address===zeroAddress?'To be decided':person(address)?.name??short(address);
 useEffect(()=>{
  if(!enabled)return;let cancelled=false,timer:ReturnType<typeof setTimeout>;const controller=new AbortController();
  const get=async<T,>(path:string):Promise<T&Envelope>=>{
   const response=await fetch(`${API}/agents${path}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])});
   if(!response.ok)throw Error(response.status===404?'This tournament does not exist.':'Tournament data is temporarily unavailable.');return response.json();
  };
  const refresh=async()=>{
   if(document.hidden){timer=setTimeout(refresh,10000);return;}
   let delay=10000;
   try{
    const summaries=await get<{items:Summary[];next:string|null;nextAt:string}>(`/tournaments?offset=${historyOffset}&limit=8`);
    const id=selected||summaries.items[0]?.id;
    const [detail,catalog]=await Promise.all([id?get<TournamentView>(`/tournaments/${id}`):null,get<{items:Identity[]}>('/catalog?limit=32')]);
    if(cancelled)return;
    setList(summaries.items);setNextPage(summaries.next);setTournament(detail);setIdentities(catalog.items);setError('');setLoading(false);
    const deadline=Number(summaries.nextAt)*1000;setNextAt(deadline>0?performance.now()+Math.max(0,deadline-Number(summaries.observation.timestamp)*1000):null);
    if(focusRequested.current){focusRequested.current=false;requestAnimationFrame(()=>heading.current?.focus());}
   }catch(e){if(cancelled)return;setError((e as Error).message);setLoading(false);delay=15000;}
   if(!cancelled)timer=setTimeout(refresh,delay);
  };
  void refresh();return()=>{cancelled=true;clearTimeout(timer);controller.abort();};
 },[enabled,selected,historyOffset,retry]);
 useEffect(()=>{if(nextAt===null){setSeconds(null);return;}const tick=()=>setSeconds(Math.max(0,Math.ceil((nextAt-performance.now())/1000)));tick();const timer=setInterval(tick,250);return()=>clearInterval(timer);},[nextAt]);
 function choose(id:string){
  if(id===selected){heading.current?.focus();return;}
  setSelected(id);setLoading(true);focusRequested.current=true;const url=new URL(location.href);url.searchParams.set('id',id);history.replaceState(null,'',url);
 }
 const identity=(address:string)=><span className="tournament-player"><Avatar index={person(address)?.avatar??9}/><span>{name(address)}</span></span>;
 const fixture=(f:TournamentFixture)=><article key={f.index} className="tournament-fixture" data-complete={f.resolved}>
  <h4>Match {f.index+1}</h4>
  <div>{identity(f.a)}<b>{f.result?.scoreA??''}</b></div><div>{identity(f.b)}<b>{f.result?.scoreB??''}</b></div>
  <p>{f.administrative?`${name(f.advanced)} advances on the pre-tournament tie-break. No win or ELO awarded.`:
   f.resolved?f.result?.winner===zeroAddress?'Draw':`${name(f.advanced)} wins`:f.ref?'Arena assigned. Waiting for its published result.':'Waiting for the previous round'}</p>
  {f.result&&<span className="tournament-validation">{f.result.finality?'Final result':'Published, still contestable'}</span>}
  {f.ref&&<Link href={`/agents/arenas/${f.ref.app}/${f.ref.epoch}/${f.ref.id}`}>{f.resolved?'View match':'Open arena'} ↗</Link>}
 </article>;
 return <main className="rooms-shell agents-shell tournament-shell">
  <header className="rooms-header"><Link href="/" className="brand" aria-label="PONGIT home"><img className="brand-mark" src="/brand/opposing-orbits.webp" width="40" height="40" alt=""/><span className="brand-word">PONGIT</span></Link>
   <div className="rooms-header-actions"><Link href="/agents">Agent Arcade</Link><a href="/docs" target="_blank" rel="noreferrer">Docs ↗</a></div></header>
  <div className="agent-heading"><div><h1>Agent tournaments</h1><p>Eight rivals. One arena circuit.</p></div><Link href="/">Back to arcade</Link></div>
  {!enabled?<section className="agent-empty"><h2>Qualification in progress</h2><p>Automatic tournaments will open after the independent arenas pass their continuous play trial.</p></section>:<>
   <nav className="tournament-history" aria-label="Recent tournaments">{list.map(t=><button key={t.id} aria-current={tournament?.id===t.id?'page':undefined} onClick={()=>choose(t.id)}>
    <span>#{t.id} {t.mode===0?'Classic':'Chaos'}</span><small>{t.format==='championship'?'Championship':'Elimination'}</small></button>)}
    {historyOffset!=='0'&&<button onClick={()=>setHistoryOffset('0')}>Latest</button>}{nextPage&&<button onClick={()=>setHistoryOffset(nextPage)}>Older tournaments</button>}</nav>
   {error&&<div role="alert" className="tournament-error"><p>{error} {tournament?'The last verified view is still displayed.':''}</p><button onClick={()=>setRetry(x=>x+1)}>Retry</button></div>}
   {loading&&!tournament&&<p role="status">Reading the tournament contracts…</p>}
   {!loading&&!tournament&&!error&&<section className="agent-empty"><h2>The circuit is getting ready</h2><p>The first tournament will appear when eight qualified agents are available.</p></section>}
   {tournament&&<section aria-busy={loading} className="tournament-detail">
    <div className="tournament-title"><div><p className="agent-badge">{tournament.mode===0?'CLASSIC':'CHAOS'} · {tournament.format==='championship'?'CHAMPIONSHIP':'ELIMINATION'}</p>
     <h2 ref={heading} tabIndex={-1}>Tournament #{tournament.id}</h2></div><span className="tournament-validation">{tournament.status==='repair-waiting'?'Result correction in progress':tournament.status==='complete'?'Completed':tournament.status==='selecting'?'Selecting participants':'In progress'}</span></div>
    {tournament.revision>0&&<p role="status">A published result was corrected. The affected standings or bracket are being rebuilt. Revision {tournament.revision}.</p>}
    {tournament.status==='complete'&&<div className="tournament-champion"><span>Champion</span>{identity(tournament.champion)}{tournament.nextAt&&seconds!==null&&<p>{seconds>0?`Next tournament in ${seconds}s`:'Preparing the next tournament'}</p>}</div>}
    {tournament.format==='championship'?<>
     <div className="tournament-table" role="region" aria-label="Championship standings" tabIndex={0}><table><caption>Three points for a win, one for a draw</caption><thead><tr><th scope="col">Agent</th><th scope="col">Points</th><th scope="col">Difference</th><th scope="col">Wins</th><th scope="col">Starting ELO</th></tr></thead>
      <tbody>{tournament.standings.filter(r=>r.agent!==zeroAddress).map(r=><tr key={r.agent}><th scope="row">{identity(r.agent)}</th><td>{r.points}</td><td>{r.difference>0?'+':''}{r.difference}</td><td>{r.wins}</td><td>{r.initialElo}</td></tr>)}</tbody></table></div>
     <h3>Fixtures</h3><div className="tournament-fixtures">{tournament.fixtures.map(fixture)}</div>
    </>:<div className="tournament-bracket">{[{title:'Quarter-finals',from:0,to:4},{title:'Semi-finals',from:4,to:6},{title:'Final',from:6,to:7}].map(round=><section key={round.title}><h3>{round.title}</h3>{tournament.fixtures.slice(round.from,round.to).map(fixture)}</section>)}</div>}
    <p className="tournament-footnote">First to seven or five minutes. Elimination draws get up to one minute of sudden death. Same-creator matches and administrative advances do not change ELO. No bets, entry fees or prizes.</p>
   </section>}
  </>}
 </main>;
}

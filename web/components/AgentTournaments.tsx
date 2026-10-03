'use client';
import {watchAgentChanges} from '../lib/agent-notifications';
import {ArcadeHeader,ArcadeHeading,ArcadeAction} from './ArcadeChrome';
import {ArcadeProgress} from './ArcadeProgress';
import {poolUserError} from '../../shared/agent-pool-error';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {zeroAddress} from 'viem';
import {API,short} from '../lib/api';
import {Avatar} from './Avatar';
import {ArcadeAmbience,MusicCredit} from './ArcadeAmbience';
import {EngineCredit} from './EngineCredit';
import type {TournamentView,TournamentFixture} from '../../shared/agent-pool';

type Summary=Pick<TournamentView,'id'|'mode'|'format'|'status'|'champion'|'revision'>;
type Identity={agent:string;name:string;avatar:number;official:boolean;creator:string};
type Envelope={observation:{block:string;hash:string;timestamp:string;revision:string}};
const quiet=()=>{};
export function AgentTournaments({enabled,initialId,preview=false}:{enabled:boolean;initialId?:string;preview?:boolean}){
 const [list,setList]=useState<Summary[]>([]),[tournament,setTournament]=useState<TournamentView|null>(null),[identities,setIdentities]=useState<Identity[]>([]);
 const [selected,setSelected]=useState(initialId??''),[error,setError]=useState(''),[loading,setLoading]=useState(enabled),[retry,setRetry]=useState(0);
 const [nextAt,setNextAt]=useState<number|null>(null),[seconds,setSeconds]=useState<number|null>(null),[historyOffset,setHistoryOffset]=useState('0'),[nextPage,setNextPage]=useState<string|null>(null);
 const heading=useRef<HTMLHeadingElement>(null),focusRequested=useRef(false);
 const person=(address:string)=>identities.find(x=>x.agent.toLowerCase()===address.toLowerCase());
 const name=(address:string)=>address===zeroAddress?'To be decided':person(address)?.name??short(address);
 useEffect(()=>{if(enabled)return watchAgentChanges(()=>setRetry(n=>n+1));},[enabled]);
 useEffect(()=>{
  if(!enabled)return;let cancelled=false,timer:ReturnType<typeof setTimeout>;const controller=new AbortController();
  const get=async<T,>(path:string):Promise<T&Envelope>=>{
   const response=await fetch(`${API}/agents${path}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])});
   if(!response.ok)throw Error(response.status===404?'This tournament does not exist.':'Tournament data is temporarily unavailable.');return response.json();
  };
  const refresh=async()=>{
   if(document.hidden){timer=setTimeout(refresh,10000);return;}
   let delay=10000;
   try{
    const summaries=await get<{items:Summary[];next:string|null;nextAt:string}>(`/tournaments?offset=${historyOffset}&limit=8`);
    const id=selected||summaries.items[0]?.id;
    if(cancelled)return;setList(summaries.items);setNextPage(summaries.next);
    // Identity labels can arrive later; they must not hide a published bracket.
    void get<{items:Identity[]}>('/catalog?limit=32').then(catalog=>{if(!cancelled)setIdentities(catalog.items);}).catch(()=>{});
    const detail=id?await get<TournamentView>(`/tournaments/${id}`):null;
    if(cancelled)return;
    setTournament(detail);setError('');setLoading(false);
    const deadline=Number(summaries.nextAt)*1000;setNextAt(deadline>0?performance.now()+Math.max(0,deadline-Number(summaries.observation.timestamp)*1000):null);
    if(focusRequested.current){focusRequested.current=false;requestAnimationFrame(()=>heading.current?.focus());}
   }catch(e){if(cancelled)return;setError(poolUserError(e));setLoading(false);delay=15000;}
   if(!cancelled)timer=setTimeout(refresh,delay);
  };
  void refresh();return()=>{cancelled=true;clearTimeout(timer);controller.abort();};
 },[enabled,selected,historyOffset,retry]);
 useEffect(()=>{if(nextAt===null){setSeconds(null);return;}const tick=()=>setSeconds(Math.max(0,Math.ceil((nextAt-performance.now())/1000)));tick();const timer=setInterval(tick,250);return()=>clearInterval(timer);},[nextAt]);
 function choose(id:string){
  if(id===selected){heading.current?.focus();return;}
  setSelected(id);setLoading(true);focusRequested.current=true;const url=new URL(location.href);url.searchParams.set('id',id);history.replaceState(null,'',url);
 }
 const interrupted=tournament?.status==='interrupted';
 const current=interrupted?undefined:tournament?.fixtures.find(f=>!f.resolved&&f.ref);
 const upcoming=interrupted?[]:tournament?.fixtures.filter(f=>!f.resolved&&!f.ref&&f.a!==zeroAddress&&f.b!==zeroAddress).slice(0,2)??[];
 const identity=(address:string)=><span className="tournament-player"><Avatar index={person(address)?.avatar??9}/><span>{name(address)}</span></span>;
 const fixture=(f:TournamentFixture)=><article key={f.index} className="tournament-fixture" data-complete={f.resolved}>
  <h4>Match {f.index+1}</h4>
  <div>{identity(f.a)}<b>{f.result?.scoreA??''}</b></div><div>{identity(f.b)}<b>{f.result?.scoreB??''}</b></div>
  <p>{f.administrative?`${name(f.advanced)} advances on the pre-tournament tie-break. No win or ELO awarded.`:
   f.resolved?f.result?.winner===zeroAddress?'Draw':`${name(f.advanced)} wins`:interrupted?'Not played — tournament interrupted':f.ref?'Match in progress.':'Waiting for the previous round'}</p>
  {f.result&&<span className="tournament-validation">{f.result.finality?'Final result':'Result recorded'}</span>}
  {f.ref&&<Link href={`/agents/arenas/${f.ref.app}/${f.ref.epoch}/${f.ref.id}`}>{f.resolved?'View match':'Open arena'} ↗</Link>}
 </article>;
 return <main className="cabinet-ui rooms-shell agents-shell tournament-shell">
  <ArcadeHeader><ArcadeAmbience onSound={quiet}/><Link href="/agents">Agent Arcade</Link><a href="/docs" target="_blank" rel="noreferrer">Docs ↗</a></ArcadeHeader>
  <ArcadeHeading title="Agent tournaments" description="Eight rivals. One arena circuit."><Link href="/agents">Choose a rival</Link></ArcadeHeading>
  {!enabled?<section className="agent-empty"><h2>Qualification in progress</h2><p>Automatic tournaments will open after the independent arenas pass their continuous play trial.</p></section>:<>

   {error&&<ArcadeProgress stage="error" detail={`${error} ${tournament?'Showing the latest standings.':''}`} actions={<button onClick={()=>setRetry(x=>x+1)}>Retry</button>}/>}
   {loading&&!tournament&&!error&&<ArcadeProgress stage="loading" title="Loading tournaments"/>}
   {!loading&&!tournament&&!error&&<ArcadeProgress stage="preparing" title="The circuit is getting ready" detail="Waiting for eight qualified rivals"/>}
   {tournament&&<section aria-busy={loading} className="tournament-detail">
    <div className="tournament-title"><div><p className="agent-badge">{tournament.mode===0?'CLASSIC':'CHAOS'} · {tournament.format==='championship'?'CHAMPIONSHIP':'ELIMINATION'}</p>
     <h2 ref={heading} tabIndex={-1}>Tournament #{tournament.id}</h2></div><span className="tournament-validation">{interrupted?'Interrupted':tournament.status==='repair-waiting'?'Result correction in progress':tournament.status==='complete'?'Completed':tournament.status==='selecting'?'Selecting participants':'In progress'}</span></div>
    {interrupted&&<p className="tournament-validation">Interrupted during arena migration. Played results are preserved; no champion was awarded.</p>}
    {tournament.status==='repair-waiting'&&<ArcadeProgress stage="synchronizing" title="Updating corrected results" detail={`Revision ${tournament.revision}`} compact/>}
    {tournament.status==='complete'&&<div className="tournament-champion"><span>Champion</span>{identity(tournament.champion)}{tournament.nextAt&&seconds!==null&&<ArcadeProgress stage="preparing" title={seconds>0?`Next tournament in ${seconds}s`:'Preparing the next tournament'} compact/>}</div>}
    {current&&<section className="tournament-now" aria-label="Current match"><div><span className="agent-badge">CURRENT MATCH</span><h3>{name(current.a)} <span>vs</span> {name(current.b)}</h3>
     <p>{tournament.mode===0?'Classic':'Chaos'} · Match {current.index+1}</p></div><ArcadeAction href={`/agents/arenas/${current.ref!.app}/${current.ref!.epoch}/${current.ref!.id}`}>Watch match ↗</ArcadeAction></section>}
    {upcoming.length>0&&<section className="tournament-next" aria-label="Next matches"><h3>Up next</h3>{upcoming.map(f=><div key={f.index}>{identity(f.a)}<span>vs</span>{identity(f.b)}</div>)}</section>}
    {tournament.format==='championship'?<>
     <div className="tournament-table" role="region" aria-label="Championship standings" tabIndex={0}><table><caption>Three points for a win, one for a draw</caption><thead><tr><th scope="col">Agent</th><th scope="col">Points</th><th scope="col">Difference</th><th scope="col">Wins</th><th scope="col">Starting ELO</th></tr></thead>
      <tbody>{tournament.standings.filter(r=>r.agent!==zeroAddress).map(r=><tr key={r.agent}><th scope="row">{identity(r.agent)}</th><td>{r.points}</td><td>{r.difference>0?'+':''}{r.difference}</td><td>{r.wins}</td><td>{r.initialElo}</td></tr>)}</tbody></table></div>
     <h3>Fixtures</h3><div className="tournament-fixtures">{tournament.fixtures.map(fixture)}</div>
    </>:<div className="tournament-bracket">{[{title:'Quarter-finals',from:0,to:4},{title:'Semi-finals',from:4,to:6},{title:'Final',from:6,to:7}].map(round=><section key={round.title}><h3>{round.title}</h3>{tournament.fixtures.slice(round.from,round.to).map(fixture)}</section>)}</div>}
    <details className="tournament-footnote"><summary>Match rules</summary><p>First to seven or five minutes. Elimination draws get up to one minute of sudden death. Same-creator matches and administrative advances do not change ELO.</p></details>
   </section>}
   <details className="tournament-history-disclosure"><summary>Tournament history</summary>
   <nav className="tournament-history" aria-label="Recent tournaments">{list.map(t=><button key={t.id} aria-current={tournament?.id===t.id?'page':undefined} onClick={()=>choose(t.id)}>
    <span>#{t.id} {t.mode===0?'Classic':'Chaos'}</span><small>{t.format==='championship'?'Championship':'Elimination'}</small></button>)}
    {historyOffset!=='0'&&<button onClick={()=>setHistoryOffset('0')}>Latest</button>}{nextPage&&<button onClick={()=>setHistoryOffset(nextPage)}>Older tournaments</button>}</nav>
   </details>
  </>}
  <footer className="rooms-footer"><MusicCredit/><EngineCredit/></footer>
 </main>;
}

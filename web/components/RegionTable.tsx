'use client';
import {useEffect,useState} from 'react';
import {API} from '../lib/api';

type Region={region:string;city:string;samples:number;share:number;medianMs:number|null;medianHomeMs:number|null;medianGainMs:number|null};
type Summary={days:number;home:string;samples:number;slowHomeShare:number;regions:Region[]};
const ms=(value:number|null)=>value===null?'–':`${value} ms`;
const pct=(value:number)=>`${Math.round(value*100)} %`;
const cell={padding:'6px 12px',borderBottom:'1px solid rgba(255,255,255,.12)',textAlign:'right'} as const;

/** Operator view of the sampled region probe: where players are, before any arena opens elsewhere. */
export function RegionTable(){
 const [days,setDays]=useState(30);
 const [data,setData]=useState<Summary>();
 const [error,setError]=useState('');
 useEffect(()=>{
  setError('');
  fetch(`${API}/region-probe?days=${days}`,{cache:'no-store'})
   .then(r=>r.ok?r.json():Promise.reject(Error(`HTTP ${r.status}`)))
   .then(setData,(e:Error)=>setError(e.message));
 },[days]);
 return <main style={{maxWidth:880,margin:'0 auto',padding:'32px 16px',fontFamily:'ui-monospace,monospace'}}>
  <h1 style={{fontSize:22}}>Player regions</h1>
  <p style={{opacity:.75}}>One visit in five times each Interlude region in the background. Only the nearest region and two latencies are kept, per day. Arenas run in Paris today (<code>{data?.home??'eu'}</code>).</p>
  <p>
   {[7,30,90].map(d=><button key={d} onClick={()=>setDays(d)} disabled={d===days} style={{marginRight:8}}>{d} days</button>)}
  </p>
  {error&&<p role="alert">Could not load the probe: {error}</p>}
  {data&&<>
   <p>{data.samples} samples · {pct(data.slowHomeShare)} of them are 100 ms or more from Paris.</p>
   <div style={{overflowX:'auto'}}>
    <table style={{borderCollapse:'collapse',width:'100%'}}>
     <thead><tr>{['Nearest region','Samples','Share','To nearest','To Paris','Local gain'].map((h,i)=><th key={h} style={{...cell,textAlign:i?'right':'left'}}>{h}</th>)}</tr></thead>
     <tbody>{data.regions.map(r=><tr key={r.region} style={{opacity:r.samples?1:.45}}>
      <td style={{...cell,textAlign:'left'}}>{r.city} <code>{r.region}</code></td>
      <td style={cell}>{r.samples}</td>
      <td style={cell}>{pct(r.share)}</td>
      <td style={cell}>{ms(r.medianMs)}</td>
      <td style={cell}>{ms(r.medianHomeMs)}</td>
      <td style={cell}>{ms(r.medianGainMs)}</td>
     </tr>)}</tbody>
    </table>
   </div>
   <p style={{opacity:.75}}>Medians. “Local gain” is what an arena in that region would save its players.</p>
  </>}
 </main>;
}

"use client";
import {useEffect,useState} from 'react';
import {independentApi} from '../lib/independent';
export function IndependentAdmin(){
 const [view,setView]=useState<any>(),[error,setError]=useState('');
 useEffect(()=>{let stopped=false;const read=()=>void independentApi('config').then(v=>{if(!stopped){setView(v);setError('');}}).catch(()=>{if(!stopped)setError('Independent arena health unavailable.');});read();const t=setInterval(read,10000);return()=>{stopped=true;clearInterval(t);};},[]);
 if(!view)return error?<section className="side-card"><p>{error}</p></section>:null;
 return <section className="side-card"><h2>Independent arenas</h2><p>{view.admission?'Admissions enabled':'Admissions paused'} · {view.sponsor.available?'Sponsor available':'Sponsor reconciling'}</p>{view.arenas.map((a:any)=><div key={a.app}><h3>Arena {view.arenas.indexOf(a)+1}</h3><p>{a.stage} · Epoch {a.epoch}</p><a href={`https://testnet.monadexplorer.com/address/${a.app}`} target="_blank" rel="noreferrer">{a.app}</a>{a.code&&<p role="status">{a.code}</p>}{a.expiresAt>0&&<p>Delegation expiry {new Date(a.expiresAt).toISOString()}</p>}{a.releaseAt>0&&<p>Earliest release {new Date(a.releaseAt).toISOString()}</p>}{a.lastProgressAt>0&&<p>Last game progress {new Date(a.lastProgressAt).toISOString()}</p>}</div>)}<p>Each publication, closure and correction is journaled separately. No automatic switch to Monad gameplay is enabled.</p></section>;
}

"use client";
import {useEffect,useRef,useState} from "react";
import {formatEther} from "viem";
import {api,relay,waitJob} from "../lib/api";
import type {Deployment} from "../../shared/protocol";
const amount=(value:string)=>formatEther(BigInt(value||0));
const labels:Record<string,string>={open:"Bet placed · waiting for the result",pending:"Payment pending",processing:"Payment pending",paid:"Paid to your wallet",delayed:"Payment delayed",no_payout:"No payout for this bet",credited:"Credited to your legacy vault"};
export function MatchPayment({account,matchId,config,onRefresh}:{account:string;matchId:string;config:Deployment;onRefresh:()=>Promise<void>}){
 const [position,setPosition]=useState<any>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);const refresh=useRef(onRefresh);refresh.current=onRefresh;
 useEffect(()=>{let cancelled=false;setPosition(null);setError("");const poll=()=>void api(`/positions/${matchId}/${account}`).then(p=>{if(!cancelled){setPosition(p);setError("");}}).catch(()=>{if(!cancelled)setError("Payment status is reconnecting.");});poll();const timer=setInterval(poll,4000);return()=>{cancelled=true;clearInterval(timer);};},[account,matchId,config.game]);
 if(!position || position.state==="none")return error?<p className="payment-note">{error}</p>:null;
 const claimable=(config.version||1)<4 && position.completed && !position.claimed && BigInt(position.amount)>0n;
 const retry=async()=>{setBusy(true);setError("");try{const job=await api("/payouts/retry",{id:position.payment.id});if(job.id)await waitJob(job.id);setPosition(await api(`/positions/${matchId}/${account}`));await refresh.current();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <div className="match-payment" role="status">
  <strong>{claimable?"Legacy payout available":labels[position.state]||"Payment pending"}</strong>
  {BigInt(position.amount)>0n&&<span>{amount(position.amount)} MON{config.version===4?" → your wallet":""}</span>}
  {config.version===4&&["pending","processing"].includes(position.state)&&<small>No action or passkey required. You can leave the site.</small>}
  {position.payment?.txHash&&<a target="_blank" rel="noreferrer" href={`https://testnet.monadscan.com/tx/${position.payment.txHash}`}>View payment ↗</a>}
  {position.state==="delayed"&&position.payment?.id&&<button disabled={busy} onClick={()=>void retry()}>Retry payment</button>}
  {claimable&&<button disabled={busy} onClick={()=>{setBusy(true);void relay({contract:"market",functionName:"claim",args:[matchId,account]}).then(async()=>{setPosition(await api(`/positions/${matchId}/${account}`));await refresh.current();}).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>Claim legacy payout / refund</button>}
  {error&&<small>{error}</small>}
 </div>;
}
export function PaymentHistory({account,onRefresh}:{account:string;onRefresh:()=>Promise<void>}){
 const [rows,setRows]=useState<any[]>([]),[next,setNext]=useState<number|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState<string|null>(null);const pagesLoaded=useRef(1),current=useRef(account),refresh=useRef(onRefresh);current.current=account;refresh.current=onRefresh;
 useEffect(()=>{let cancelled=false,last="";pagesLoaded.current=1;setRows([]);setNext(null);setError("");const poll=()=>void api(`/payouts/${account}`).then(data=>{if(cancelled)return;setRows(old=>{const ids=new Set(data.payments.map((p:any)=>p.id));return [...data.payments,...old.filter(p=>!ids.has(p.id))];});if(pagesLoaded.current===1)setNext(data.nextOffset);setError("");const signature=data.payments.map((p:any)=>p.id+":"+p.state).join("|");if(signature!==last){last=signature;void refresh.current();}}).catch(()=>{if(!cancelled)setError("Payment history is reconnecting. Transfers continue automatically.");});poll();const timer=setInterval(poll,4000);return()=>{cancelled=true;clearInterval(timer);};},[account]);
 async function retry(id:string){setBusy(id);setError("");try{const job=await api("/payouts/retry",{id});if(job.id)await waitJob(job.id);const data=await api(`/payouts/${account}`);if(current.current===account)setRows(data.payments);await refresh.current();}catch(e){setError((e as Error).message);}finally{setBusy(null);}}
 return <details className="payment-history"><summary>Wallet payments{rows.length?` · ${rows.length}`:""}</summary><p>Winning bets, tournament prizes and refunds are sent to your Mera wallet. Wallet funds are separate from your betting balance.</p>
  {rows.map(p=><article className="payment-row" key={p.id} data-payment-id={p.id}><div><strong>{p.kind===0?"Bet settlement":p.kind===1?"Tournament prize":p.kind===2?"Entry refund":"Tournament seed refund"} · {p.deployment}:{p.sourceId}</strong><span>{labels[p.state]||"Payment pending"}</span></div><div><strong>{amount(p.amount)} MON</strong>{p.txHash&&<a target="_blank" rel="noreferrer" href={`https://testnet.monadscan.com/tx/${p.txHash}`}>Receipt ↗</a>}{p.state==="delayed"&&<button disabled={busy===p.id} onClick={()=>void retry(p.id)}>Retry payment</button>}</div></article>)}
  {!rows.length&&!error&&<p>No wallet payments yet.</p>}{error&&<p role="status">{error}</p>}
  {next!==null&&<button disabled={busy!==null} onClick={()=>{setBusy("page");void api(`/payouts/${account}?offset=${next}`).then(data=>{if(current.current===account){pagesLoaded.current++;setRows(old=>{const ids=new Set(old.map(p=>p.id));return [...old,...data.payments.filter((p:any)=>!ids.has(p.id))];});setNext(data.nextOffset);}}).catch(e=>setError(e.message)).finally(()=>setBusy(null));}}>More payments</button>}
 </details>;
}

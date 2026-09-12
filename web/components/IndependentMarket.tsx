"use client";
import {useEffect,useRef,useState} from 'react';
import {formatEther,parseEther,encodeFunctionData,type Address,type Hex} from 'viem';
import type {IndependentManifest,ChainOperation} from '../../shared/independent';
import {independentCreditMessage} from '../../shared/independent';
import {betTypes,withdrawTypes,domain} from '../../shared/protocol';
import {abi as marketAbi} from '../../shared/abi-independent-MarketV4';
import {abi as vaultAbi} from '../../shared/abi-independent-RoomsVault';
import {independentBase,independentApi,withOwner,sponsorCall,resumeSponsored} from '../lib/independent';
import styles from './RoomsMarketPanel.module.css';
const mon=(v:bigint|string|undefined)=>v===undefined?'…':Number(formatEther(BigInt(v))).toLocaleString('en',{maximumFractionDigits:6});
export function IndependentMarket({manifest:m,player,id,onBusy}:{manifest:IndependentManifest;player:Address;id?:bigint;onBusy:(value:boolean)=>void}){
 const [market,setMarket]=useState<any>(),[balances,setBalances]=useState<{wallet:bigint;credit:bigint}>(),[side,setSide]=useState<0|1>(0),[shares,setShares]=useState('0.001'),[withdraw,setWithdraw]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[tx,setTx]=useState<Hex>();
 const working=useRef(false),reading=useRef(false),generation=useRef(0);
 const [payments,setPayments]=useState<any[]>([]);
 const base=independentBase();let quantity=0n;try{quantity=parseEther(shares);}catch{}
 async function refresh(){if(reading.current)return;reading.current=true;const g=generation.current;
  try{
   const [wallet,credit,view]=await Promise.all([base.getBalance({address:player}),base.readContract({address:m.vault,abi:vaultAbi,functionName:'balances',args:[player]}),id?independentApi(`market/${id}?player=${player}&side=${side}&shares=${quantity>0n?quantity:1000000000000n}`):undefined]);
   if(g!==generation.current)return;setBalances({wallet,credit});setMarket(view?{...view,side,quantity}:undefined);
  }finally{reading.current=false;}
 }
 useEffect(()=>{generation.current++;void refresh().catch(()=>{});const t=setInterval(()=>{if(!document.hidden&&!working.current)void refresh().catch(()=>{});},3000);return()=>{generation.current++;clearInterval(t);};},[player,id,side,shares]);
 useEffect(()=>{let stopped=false;const poll=()=>void independentApi(`player/${player}/payments`).then(r=>{if(!stopped)setPayments(r);}).catch(()=>{});poll();const t=setInterval(poll,10000);return()=>{stopped=true;clearInterval(t);};},[player]);
 async function perform(fn:()=>Promise<ChainOperation>){if(working.current)return;working.current=true;setBusy(true);onBusy(true);setMessage('');try{await resumeSponsored(m);let op=await fn();const until=Date.now()+45000;while(op.status==='queued'||op.status==='pending'){if(Date.now()>until)throw Error('Transaction still pending. Close this panel and check its confirmation later.');setMessage('Payment transaction pending on Monad');await new Promise(r=>setTimeout(r,1000));op=await independentApi(`operations/${op.id}`);}if(op.status==='failed')throw Error(op.error||'Transaction reverted');setTx(op.hash);setMessage('Confirmed on Monad');await refresh();}catch(e){setMessage((e as Error).message);}finally{working.current=false;setBusy(false);onBusy(false);}}
 const participant=market&&[market.result[0],market.result[1]].some((a:string)=>a.toLowerCase()===player.toLowerCase());
 const cost=BigInt(market?.quote||0),cap=cost+cost/100n+1n,quoteFresh=market?.quantity===quantity&&market?.side===side;
 const paid=BigInt(market?.position?.[2]||0),terminal=Number(market?.result?.[3])>=3;
 const payoutAmount=market&&terminal?(Number(market.result[3])===4?paid:market.result[2].toLowerCase()===market.result[0].toLowerCase()?BigInt(market.position[0]):BigInt(market.position[1])):0n;
 return <section className={styles.panel}><div className="rooms-finance-balances"><div><span>Wallet balance</span><strong>{mon(balances?.wallet)} MON</strong></div><div><span>Available for betting</span><strong>{mon(balances?.credit)} MON</strong></div></div><p>Test MON only. Winnings are paid to your wallet and are not automatically put back into betting credit.</p>
  <button disabled={busy} onClick={()=>void perform(()=>withOwner(player,async identity=>{const expires=Number((await base.getBlock()).timestamp)+120;const signature=await identity.account.signMessage({message:independentCreditMessage(player,m.vault,expires)});return independentApi('credit',{player,expires,signature});}))}>Get test betting credit</button>
  {id&&market&&<>{participant?<p>You cannot bet on your own match.</p>:!terminal?<><div className="control-segments"><button aria-pressed={side===0} disabled={busy} onClick={()=>setSide(0)}>Player 01</button><button aria-pressed={side===1} disabled={busy} onClick={()=>setSide(1)}>Player 02</button></div><label>Shares (1 winning share = 1 MON)<input inputMode="decimal" value={shares} onChange={e=>setShares(e.target.value)}/></label><dl><div><dt>Estimated cost</dt><dd>{quoteFresh?mon(cost):'…'} MON</dd></div><div><dt>Maximum signed cost</dt><dd>{quoteFresh?mon(cap):'…'} MON</dd></div><div><dt>Potential payout</dt><dd>{mon(quantity)} MON</dd></div></dl><p>Supporting a player can shrink their paddle in the next rally. Bets are accepted only during Betting open.</p>
   <button className="primary" disabled={busy||!quoteFresh||!market.window[0]||!cost||quantity<=0n||cap>(balances?.credit??0n)} onClick={()=>void perform(()=>withOwner(player,async identity=>{
    const nonce=await base.readContract({address:m.market,abi:marketAbi,functionName:'nonces',args:[player]}),deadline=(await base.getBlock()).timestamp+90n;
    const bet={player,matchId:id,side,shares:quantity,maxCost:cap,version:BigInt(market.window[1]),nonce,deadline};
    const signature=await identity.account.signTypedData({domain:domain('PONG Market',10143,m.market),types:betTypes,primaryType:'Bet',message:bet});
    return sponsorCall(m,m.market,encodeFunctionData({abi:marketAbi,functionName:'buy',args:[bet,signature]}));
   }))}>{market.window[0]?'Confirm bet with passkey':'Betting closed'}</button>
  </>:null}
   {paid>0n&&terminal&&<div role="status">{payoutAmount===0n?'Position lost · no payout':Number(market.payout[2])===2?'Paid to your wallet':Number(market.payout[2])===1?'Payment delayed':'Payment pending'}{payoutAmount>0n&&<strong> · {mon(payoutAmount)} MON</strong>}{Number(market.payout[2])===1&&<button disabled={busy} onClick={()=>void perform(()=>sponsorCall(m,m.market,encodeFunctionData({abi:marketAbi,functionName:'retryPayout',args:[market.payoutId]})))}>Retry payment</button>}{market.payment?.hash&&<a href={`https://testnet.monadexplorer.com/tx/${market.payment.hash}`} target="_blank" rel="noreferrer">View payment ↗</a>}</div>}
  </>}
  <details><summary>Withdraw betting credit</summary><label>MON to withdraw<input inputMode="decimal" value={withdraw} onChange={e=>setWithdraw(e.target.value)}/></label><button disabled={busy||!withdraw} onClick={()=>void perform(()=>withOwner(player,async identity=>{
   const amount=parseEther(withdraw);if(amount<=0n||amount>(balances?.credit??0n))throw Error('Enter an amount within your available credit');
   const nonce=await base.readContract({address:m.vault,abi:vaultAbi,functionName:'nonces',args:[player]}),deadline=(await base.getBlock()).timestamp+120n;
   const value={player,recipient:player,amount,nonce,deadline};const signature=await identity.account.signTypedData({domain:domain('PONG Vault',10143,m.vault),types:withdrawTypes,primaryType:'Withdraw',message:value});
   return sponsorCall(m,m.vault,encodeFunctionData({abi:vaultAbi,functionName:'withdraw',args:[player,player,amount,nonce,deadline,signature]}));
  }))}>Withdraw with passkey</button></details>
  <h3>Payments</h3>{payments.length===0?<p>No betting positions yet.</p>:payments.map(p=><div key={p.id}><span>Match {p.id} · {Number(p.payout[2])===2?'Paid to your wallet':Number(p.payout[2])===1?'Payment delayed':Number(p.result[3])<3?'Match in progress':p.position[3]?'Position settled':'Payment pending'}</span>{BigInt(p.payout[1])>0n&&<strong> · {mon(p.payout[1])} MON</strong>}{Number(p.payout[2])===1&&<button disabled={busy} onClick={()=>void perform(()=>sponsorCall(m,m.market,encodeFunctionData({abi:marketAbi,functionName:'retryPayout',args:[p.payoutId]})))}>Retry payment</button>}{p.payment?.hash&&<a href={`https://testnet.monadexplorer.com/tx/${p.payment.hash}`} target="_blank" rel="noreferrer">View transaction ↗</a>}</div>)}
  <a href="/?deployment=v4">Previous balances and withdrawals ↗</a>{message&&<p role="status">{message}</p>}{tx&&<a href={`https://testnet.monadexplorer.com/tx/${tx}`} target="_blank" rel="noreferrer">Transaction ↗</a>}
 </section>;
}

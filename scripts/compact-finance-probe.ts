// Private testnet-only companion: real Chaos bridge and payouts, no admissions or closure.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {encodeFunctionData,keccak256,parseEther} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {chainTools} from './independent-chain-tools';
import {independentEngine} from '../relayer/src/independent-engine';
import {independentFinance} from '../relayer/src/independent-finance';
import {readHubDelegation} from '../shared/rooms-hub';
import {domain,betTypes} from '../shared/protocol';
const path=process.env.PONG_INDEPENDENT_MANIFEST!,keysPath=process.env.PONG_INDEPENDENT_TEST_KEYS!;
assert(path?.startsWith('/secrets/')&&keysPath?.startsWith('/secrets/'));
const m=JSON.parse(await readFile(path,'utf8'));assert.equal(m.production,false);
const keys=JSON.parse(await readFile(keysPath,'utf8')),match=keys.matches[1];assert(match?.app&&match.mode===1);
const t=await chainTools(m.prefix+':compact-finance:20260912');
const bridge=JSON.parse(await readFile(process.env.ROOMS_PRESSURE_KEY_FILE!,'utf8'));
const engine=independentEngine(t.db,t.base,match.app,match.node,bridge.privateKey);
const drain=process.env.PONG_COMPACT_FINANCE_DRAIN==='true';
const hub=await readHubDelegation(t.base,m.hub,match.app);assert([1,2].includes(hub.status));assert.equal(hub.epoch,BigInt(match.epoch));if(hub.status===1)engine.bind(BigInt(match.id),hub.epoch);
const market=await t.artifact('MarketV4'),vault=await t.artifact('RoomsVault'),arena=await t.artifact('IndependentArena'),settlement=await t.artifact('IndependentSettlement');
const bettor=privateKeyToAccount(keys.players[0].root),id=BigInt(match.id);
const report:any=drain?JSON.parse(await readFile('artifacts/independent-candidate/compact-finance.json','utf8')):{at:new Date().toISOString(),app:match.app,id:match.id,bettor:bettor.address,signatures:0,passed:false};
assert.equal(report.id,match.id);assert.equal(report.bettor,bettor.address);
const read=(at:any,abi:any,name:string,args:any[]=[])=>t.base.readContract({address:at,abi,functionName:name,args}) as Promise<any>;
const flush=()=>writeFile('artifacts/independent-candidate/compact-finance.json',JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));
const finance=await independentFinance(t.db,t.base,m,bridge.privateKey,async(at,abi,name,args=[],value=0n)=>{
 const data=encodeFunctionData({abi,functionName:name,args});let context='';
 if(name==='openRound'){const s:any=await read(match.app,arena.abi,'getSnapshot',[id]);context='-'+(s[12].scoreA+s[12].scoreB);}
 return t.write(`finance-${name.toLowerCase()}-${keccak256(data).slice(2,18)}${context}`,at,abi,name,args,value);
});
let bought=drain;
try{
 if(drain){
  const p=await read(m.market,market.abi,'positions',[id,bettor.address]);assert(p[2]>0n);assert.equal(p[1],BigInt(report.bet.shares));report.balanceBefore=BigInt(report.balanceBefore);
 }else{
 const deposit=await t.write('fund-betting-credit',m.vault,vault.abi,'depositFor',[bettor.address],parseEther('.02'));report.deposit=deposit.transactionHash;
 report.balanceBefore=await t.base.getBalance({address:bettor.address});await flush();
 }
 const end=Date.now()+16*60_000;
 while(Date.now()<end){
  const d=await readHubDelegation(t.base,m.hub,match.app);
  if(d.status===1&&!drain){
   const s=await engine.read();if(s.phase===2&&s.state.awaitingServe){
    await finance.checkpoint(engine);
    const window=await read(m.settlement,settlement.abi,'bettingWindow',[id,0n]);
    if(window[0]&&!bought){
     const shares=parseEther('.006'),quote=await read(m.market,market.abi,'quote',[id,1,shares]);
     const maxCost=quote+quote/20n+100n;assert(maxCost<parseEther('.01'));
     const bet={player:bettor.address,matchId:id,side:1,shares,maxCost,version:window[1],nonce:await read(m.market,market.abi,'nonces',[bettor.address]),deadline:(await t.base.getBlock()).timestamp+90n};
     const signature=await bettor.signTypedData({domain:domain('PONG Market',10143,m.market),types:betTypes,primaryType:'Bet',message:bet});report.signatures++;
     // Persist the financial authorization before submission; an uncertain run
     // must be inspected, not restarted with another authorization.
     await writeFile('/secrets/compact-paid-authorization-20260912.json',JSON.stringify({bet,signature},(_,v)=>typeof v==='bigint'?String(v):v),{mode:0o600,flag:'wx'});
     const receipt=await t.write('root-signed-bet',m.market,market.abi,'buy',[bet,signature]);bought=true;
     const p=await read(m.market,market.abi,'positions',[id,bettor.address]);assert(p[2]>=parseEther('.002'));
     report.bet={hash:receipt.transactionHash,shares,paid:p[2],side:1};await flush();console.log(JSON.stringify({betPaid:String(p[2]),hash:receipt.transactionHash}));
    }
   }else if(s.phase===2&&s.state.halfB<48000000n){
    if(!report.handicap){report.handicap={halfA:s.state.halfA,halfB:s.state.halfB,rally:s.state.scoreA+s.state.scoreB};await flush();}
   }
  }
  await finance.payments();
  const result=await read(m.settlement,settlement.abi,'result',[id]);
  if(result[3]===3&&bought){
   const payoutId=await read(m.market,market.abi,'payoutId',[0,id,bettor.address]),payout=await read(m.market,market.abi,'payouts',[payoutId]);
   if(payout[2]===2){
    const expected=result[2].toLowerCase()===result[1].toLowerCase()?parseEther('.006'):0n;
    report.balanceAfter=await t.base.getBalance({address:bettor.address});assert.equal(report.balanceAfter-report.balanceBefore,expected);assert.equal(payout[1],expected);assert.equal(payout[3],1);
    assert(report.handicap,'Paid checkpoint must affect a later rally');report.payout={id:payoutId,amount:payout[1],attempts:payout[3],winner:result[2]};report.passed=true;break;
   }
  }
  // A stopped fixture's historical cursor may be hours behind. A single reader
  // catches up in bounded 100-block pages; it never skips unseen financial events.
  const cursor=drain?(await t.db.query('SELECT block_number FROM independent_finance_cursor WHERE lobby=$1',[m.lobby.toLowerCase()])).rows[0]:null;
  const backfill=cursor&&BigInt(cursor.block_number)+100n<await t.base.getBlockNumber();
  await new Promise(r=>setTimeout(r,backfill?100:2000));
 }
 assert(report.passed,'Full Chaos checkpoint and payout timed out');
}catch(e){report.error=String((e as any).shortMessage||(e as Error).message).split('Request Arguments')[0].replace(/0x[\da-f]{130,}/gi,'[signed data omitted]').slice(0,600);process.exitCode=1;}
finally{engine.bind(0n,0n);report.finishedAt=new Date().toISOString();await flush();await t.close();console.log(JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v));}

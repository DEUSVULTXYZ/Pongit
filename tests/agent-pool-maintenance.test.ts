import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodeFunctionData,zeroAddress,zeroHash,type Address} from 'viem';
import {expiredChallenge,historicalRepairWork,qualificationWork,capturedTournamentWork,tournamentDue,tournamentIntervalSeconds,pinnedReads,type PoolRead} from '../relayer/src/agents/pool-maintenance';
const address=(n:number)=>`0x${n.toString(16).padStart(40,'0')}` as Address;
const m={pool:address(1),catalog:address(2),qualifications:address(3),challenges:address(4),family:address(5),tournaments:address(6)};

test('captured current results advance tournaments after lane release or restart without waiting for a historical scan',async()=>{
 const ref={chainId:10143n,arena:address(22),epoch:2n,id:35n};
 const record={captured:true,tournament:3n,fixture:6,ref};
 const result={hash:'0x'+'1'.repeat(64),status:3,finality:false};
 const f={bound:true,resolved:false,ref:{...ref},published:{hash:String(zeroHash),status:0,finality:false}};
 const read:PoolRead=async(_a,abi,fn,args=[])=>{
  encodeFunctionData({abi,functionName:fn,args});
  if(fn==='fixture')return f as any;if(fn==='result')return result as any;throw Error(fn);
 };
 assert.deepEqual(await capturedTournamentWork(read,m,record),{to:m.tournaments,method:'synchronize',args:[3n,6]});
 f.published={...result};f.resolved=true;
 assert.equal(await capturedTournamentWork(read,m,record),null);
 result.finality=true;assert.equal((await capturedTournamentWork(read,m,record))?.method,'synchronize');
 f.ref.id=36n;assert.equal(await capturedTournamentWork(read,m,record),null);
 f.ref={...ref};f.ref.epoch=3n;assert.equal(await capturedTournamentWork(read,m,record),null);
 f.ref={...ref};f.ref.arena=address(23);assert.equal(await capturedTournamentWork(read,m,record),null);
 f.ref={...ref};record.captured=false;assert.equal(await capturedTournamentWork(read,m,record),null);
 record.captured=true;record.tournament=0n;assert.equal(await capturedTournamentWork(read,m,record),null);
 record.tournament=3n;result.status=4;f.published={...result};f.resolved=false;
 assert.equal((await capturedTournamentWork(read,m,record))?.method,'retryCancelled');
 await assert.rejects(capturedTournamentWork((async()=>{throw Error('lost read');}) as PoolRead,m,record),/lost read/);
});

test('bounded qualification scans eventually reach agents beyond the first 256 and wrap after catalogue changes',async()=>{
 let cursor=0n,inspected=0,found=false;
 const read:PoolRead=async(_a,_abi,fn,args=[])=>{
  if(fn==='count')return 513n as any;
  if(fn==='at'){inspected++;return address(Number(args[0])+100) as any;}
  if(fn==='identity')return{available:true,modes:3,qualified:args[0]===address(612)?1:3} as any;
  if(fn==='retryAt')return 0n as any;
  if(fn==='house')return address(999) as any;
  if(fn==='qualificationEligible')return true as any;throw Error(fn);
 };
 for(let n=0;n<33;n++){const before=inspected,r=await qualificationWork(read,m,cursor,1000n);cursor=r.next;assert(inspected-before<=16);if(r.needed){found=true;break;}}
 assert(found);assert.equal(cursor,0n);
 const r=await qualificationWork(read,m,1026n,1000n);assert.equal(r.needed,false);assert.equal(r.next,16n);
});

test('qualification waits for an actual opponent and a base block containing the strategy',async()=>{
 let partner=false,base=500n;
 const candidate=address(100),house=address(101);
 const read:PoolRead=async(_a,abi,fn,args=[])=>{
  // Exercise the shipped ABI as the actual RPC client does, not only the mock's dispatch.
  encodeFunctionData({abi,functionName:fn,args});
  if(fn==='count')return 1n as any;if(fn==='at')return candidate as any;
  if(fn==='identity')return{available:true,modes:1,qualified:0,house:0} as any;
  if(fn==='registeredBlock')return base as any;if(fn==='retryAt')return 0n as any;
  if(fn==='house')return house as any;
  if(fn==='qualificationEligible')return(args[0]===candidate||partner) as any;
  throw Error(fn);
 };
 assert.equal((await qualificationWork(read,m,0n,1000n,16,600n)).needed,false);
 partner=true;assert.equal((await qualificationWork(read,m,0n,1000n,16,400n)).needed,false);
 assert.equal((await qualificationWork(read,m,0n,1000n,16,500n)).needed,true);
});

test('qualification inspection respects retry times and propagates unavailable reads',async()=>{
 const read:any=async(_a:any,_abi:any,fn:string)=>({count:1n,at:address(100),identity:{available:true,modes:1,qualified:0},retryAt:1200n}[fn]);
 assert.equal((await qualificationWork(read,m,0n,1100n)).needed,false);
 await assert.rejects(qualificationWork((async()=>{throw Error('RPC unavailable');}) as PoolRead,m,0n,1300n),/RPC unavailable/);
});

test('only waiting challenges with a verifiably different or expired grant can be cleared',async()=>{
 const grant='0x'+'1'.repeat(64);let status=2,changed=false;
 const read:PoolRead=async(_a,_abi,fn)=>{
  if(fn==='count')return 1n as any;
  if(fn==='requests')return[address(20),address(21),0,status,1n,grant] as any;
  if(fn==='grantOf')return{key:changed?zeroAddress:address(22)} as any;
  if(fn==='grantDigest')return grant as any;throw Error(fn);
 };
 changed=true;assert.equal((await expiredChallenge(read,m,1n)).expired,null);
 status=1;changed=false;assert.equal((await expiredChallenge(read,m,1n)).expired,null);
 changed=true;assert.equal((await expiredChallenge(read,m,1n)).expired,1n);
 await assert.rejects(expiredChallenge((async()=>{throw Error('lost response');}) as PoolRead,m,1n),/lost response/);
});

test('historical repairs wait for existing participation and can later schedule their original bracket',async()=>{
 const hash='0x'+'1'.repeat(64),t={status:4,agents:Array.from({length:8},(_,i)=>address(100+i)),controllers:Array(8).fill(hash),mode:0};
 let busy=true,changed=false;
 const read:PoolRead=async(_a,_abi,fn,args=[])=>{
  if(fn==='eligible')return !(busy&&args[0]===t.agents[3]) as any;
  if(fn==='identity')return{codeHash:changed?zeroHash:hash} as any;
  if(fn==='nextFixture')return[4,t.agents[0],t.agents[1],false] as any;
  if(fn==='playing')return(busy?hash:zeroHash) as any;throw Error(fn);
 };
 assert.equal(await historicalRepairWork(read,m,1n,t,1n,true),null);
 busy=false;changed=true;assert.equal(await historicalRepairWork(read,m,1n,t,1n,true),null);
 changed=false;assert.equal((await historicalRepairWork(read,m,1n,t,1n,true))?.method,'resumeRepair');
 t.status=2;assert.deepEqual(await historicalRepairWork(read,m,1n,t,1n,true),{to:m.pool,method:'admitTournament',args:[1n]});
 assert.equal(await historicalRepairWork(read,m,1n,t,1n,false),null);assert.equal(await historicalRepairWork(read,m,1n,t,0n,true),null);
});

test('public tournaments start once every three days, anchored on the previous onchain start',()=>{
 const day=86400n,start=1_000_000n;
 // The book only enforces a one-minute floor; the keeper owns the cadence.
 assert.equal(tournamentDue({startedAt:start},start+60n,start+60n),false);
 assert.equal(tournamentDue({startedAt:start},start+60n,start+3n*day-1n),false);
 assert.equal(tournamentDue({startedAt:start},start+60n,start+3n*day),true);
 assert.equal(tournamentIntervalSeconds,3n*day);
 // A restart cannot shorten the gap, and the book's own floor still applies.
 assert.equal(tournamentDue({startedAt:start},start+4n*day,start+3n*day),false);
 // The very first tournament waits for nothing but the book.
 assert.equal(tournamentDue(null,0n,0n),true);
});

test('pinned step reads are served once, normalised, started together and retried after a failure',async()=>{
 const calls:string[]=[];let fail=true;
 const pinned=pinnedReads(async(address,_abi,fn,args)=>{calls.push(fn);await Promise.resolve();
  if(fn==='flaky'&&fail){fail=false;throw Error('transport');}return fn+':'+String(address).toLowerCase()+':'+JSON.stringify(args,(_,v)=>typeof v==='bigint'?String(v):v);});
 const a=address(7);
 // A prefetch and the later read of the same pinned call share one request,
 // whatever the address case and even for bigint arguments.
 pinned.prefetch(a,[] as any,'record',[{id:5n,arena:a}]);
 const value=await pinned.read(a.toUpperCase().replace('0X','0x') as any,[] as any,'record',[{id:5n,arena:a.toUpperCase().replace('0X','0x')}]);
 assert.equal(calls.filter(c=>c==='record').length,1);assert.match(String(value),/^record:/);
 // A number and a bigint are different arguments and must never share a result.
 await pinned.read(a,[] as any,'lane',[0]);await pinned.read(a,[] as any,'lane',[0n]);
 assert.equal(calls.filter(c=>c==='lane').length,2);
 // Independent reads are issued before any of them resolves, so a batched
 // client can place them in one multicall.
 const started=calls.length;const together=[pinned.read(a,[] as any,'x'),pinned.read(a,[] as any,'y'),pinned.read(a,[] as any,'z')];
 assert.equal(calls.length,started+3);await Promise.all(together);
 // A failed read is not cached: the next caller retries it.
 await assert.rejects(pinned.read(a,[] as any,'flaky'),/transport/);
 assert.equal(await pinned.read(a,[] as any,'flaky'),'flaky:'+a.toLowerCase()+':[]');
 assert.equal(calls.filter(c=>c==='flaky').length,2);
});

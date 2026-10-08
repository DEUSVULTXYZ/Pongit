// Read-only public snapshot. Active delegation is not proof of a working node.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createPublicClient,http,formatEther,type Address} from 'viem';
import {readHubDelegations} from '../shared/rooms-hub';
const label=process.env.PONG_CANONICAL_LABEL;
assert(label&&/^[a-z0-9-]{1,45}$/.test(label));
async function read(path:string){const r=await fetch('https://pongit.xyz/api/'+path,{signal:AbortSignal.timeout(10000)});assert(r.ok);return r.json();}
const [agents,human]=await Promise.all([read('agents/config'),read('independent/config')]);
assert.equal(agents.pool.toLowerCase(),'0xe01c31f482113367c510a04816ff371676477fa3');
assert.equal(human.manifest.lobby.toLowerCase(),'0xdf44e1cae317bc9d8bafcf9b292b08bb90996fb7');
assert.equal(agents.rulesVersion,17);assert.equal(human.manifest.rulesVersion,18);
assert.equal(agents.hub.toLowerCase(),'0x98922c6e5e4bea62761c71d2401c7ec2c26ec43e');
assert.equal(human.manifest.hub.toLowerCase(),agents.hub.toLowerCase());
const apps=[...agents.arenas.map((a:any)=>({app:a.app as Address,role:'agents'})),...human.manifest.arenas.map((a:any)=>({app:a.app as Address,role:'human'}))];
assert.equal(apps.length,11);assert.equal(new Set(apps.map(a=>a.app.toLowerCase())).size,11);
const client=createPublicClient({transport:http('https://testnet-rpc.monad.xyz',{retryCount:0,timeout:15000})});
const block=await client.getBlock();
const states=await readHubDelegations(client,agents.hub,apps.map(a=>a.app),block.number);
const rows=states.map((d,i)=>({...apps[i],status:d.status,epoch:String(d.epoch),expiresAt:String(d.expiresAt),batches:String(d.batchIndex)}));
assert(rows.every(d=>d.status===1&&d.epoch==='1'&&d.expiresAt==='0'),'Delegation changed; preserve this diagnostic failure');
const operator='0x369158ac444278541322643e46e0d5b45ac21c4c';
const balance=await client.getBalance({address:operator,blockNumber:block.number});
assert.equal((await client.getBlock({blockNumber:block.number})).hash,block.hash);
const output={at:new Date().toISOString(),passed:true,readOnly:true,block:String(block.number),hash:block.hash,hub:agents.hub,
  rules:{agents:17,human:18},operator,operatorMon:formatEther(balance),delegations:rows,
  qualification:{agents:agents.qualified,capacity:agents.verifiedCapacity,tournamentsEnabled:agents.tournamentsEnabled},
  scope:'Canonical continuous-delegation snapshot. Does not prove hosted availability or 24-hour operation.'};
await writeFile(`artifacts/responsive-20261008-r2/canonical-${label}.json`,JSON.stringify(output,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(output));

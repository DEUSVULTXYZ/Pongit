// Laboratory only: publish one more sample strategy, for another creator, so the laboratory can
// play strategy against strategy, which only the coordinator can start. Deploy it before the next
// epoch opens: the engine reads Monad as pinned then. Re-runnable through the operator journal.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {chainTools} from './independent-chain-tools';
import {pongStrategyAbi} from '../shared/agents';
assert.equal(process.env.PONG_AGENT_DEPLOY,'authorized-dedicated-testnet');
if(!process.env.DATABASE_URL)process.env.DATABASE_URL=`postgresql://pong:${encodeURIComponent(process.env.POSTGRES_PASSWORD!)}@postgres:5432/pong_relayer`;
const prefix=process.env.PONG_AGENT_DEPLOY_PREFIX!,file=`/secrets/${prefix}.json`;
assert(/^agent-arcade-candidate-\d{8}(-[2-9])?$/.test(prefix),'Name the laboratory deployment');
const r=JSON.parse(await readFile(file,'utf8'));assert(r.app&&r.strategy,'The laboratory has no first strategy');
const save=async()=>{await writeFile(file+'.next',JSON.stringify(r,null,2),{mode:0o600});await rename(file+'.next',file);};
const deadZone=BigInt(process.env.PONG_AGENT_LAB_DEAD_ZONE??'12');
const t=await chainTools(prefix);
try{
 r.strategyCreator2??=generatePrivateKey();await save();
 const creator=privateKeyToAccount(r.strategyCreator2).address;
 r.strategy2??=await t.deploy('TrackerStrategy',[creator,deadZone],'TrackerStrategy2');await save();
 assert.equal(String(await t.base.readContract({address:r.strategy2,abi:pongStrategyAbi,functionName:'creator'})).toLowerCase(),creator.toLowerCase());
 console.log(JSON.stringify({app:r.app,strategy2:r.strategy2,creator,deadZone:String(deadZone)}));
}finally{await t.close();}

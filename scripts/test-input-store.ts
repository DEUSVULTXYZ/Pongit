import assert from "node:assert/strict";
import pg from "pg";
import {createPublicClient,http,type Hex} from "viem";
import {generatePrivateKey,privateKeyToAccount} from "viem/accounts";
import {createInputs,initializeInputs} from "../relayer/src/inputs";
import {domain,inputTypes,type Deployment} from "../shared/protocol";
import {intentMessage,intentTypes} from "../shared/input-transport";
const url=process.env.INPUT_TEST_DATABASE_URL;if(!url || new URL(url).pathname!=="/pongit_input_test")throw new Error("Dedicated disposable input database required");
const chain=createPublicClient({transport:http(process.env.RPC_URL)});if(await chain.getChainId()!==31337)throw new Error("Private test chain only");
const db=new pg.Pool({connectionString:url});
try{
 await db.query("CREATE TABLE IF NOT EXISTS relay_jobs(id text PRIMARY KEY,payload jsonb NOT NULL,status text NOT NULL DEFAULT 'queued',raw_tx text,tx_hash text,error text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now())");await initializeInputs(db);
 const player=privateKeyToAccount(generatePrivateKey()),key=privateKeyToAccount(generatePrivateKey()),opponent=privateKeyToAccount(generatePrivateKey());let block=100n,valid=true;
 const deployment={chainId:31337,game:opponent.address} as Deployment,slot={key:key.address,nonce:0n,remaining:100,expiry:BigInt(Math.floor(Date.now()/1000)+3600)};
 const events:any[]=[],lane=`v4:1:${player.address.toLowerCase()}`;
 const inputs=createInputs({db,deployment,version:"v4",read:async()=>({status:2,playerA:player.address,playerB:opponent.address,a:slot,b:slot}),head:()=>block,valid:async()=>valid,notify:e=>events.push(e)});
 const request=async(direction:number,nonce:bigint,sequence:bigint,signer=key)=>{
   const input={matchId:1n,player:player.address,direction,nonce,observedBlock:block,validUntilBlock:block+16n};
   const signature=await signer.signTypedData({domain:domain("PONG",31337,deployment.game),types:inputTypes,primaryType:"Input",message:input});
   const intentSignature=await signer.signTypedData({domain:domain("PONGIT Input Transport",31337,deployment.game),types:intentTypes,primaryType:"InputIntent",message:intentMessage(input,sequence,31337,deployment.game)});
   return [{contract:"game",functionName:"submitInput",args:[input,signature]},{sequence,signature:intentSignature}] as const;
 };
 const accept=async(...args:Parameters<typeof request>)=>{const [payload,envelope]=await request(...args);return inputs.accept({...payload,args:[...payload.args]},envelope);};
 const first=await accept(1,1n,1n);assert.equal(first.accepted,true);assert.equal((await accept(1,1n,1n)).id,first.id);
 const stop=await accept(0,1n,3n);assert.equal(stop.accepted,true);assert.equal((await accept(-1,1n,2n)).accepted,false);
 assert.equal((await db.query("SELECT status FROM relay_jobs WHERE id=$1",[first.id])).rows[0].status,"superseded");
 await inputs.lock(lane,()=>db.query("UPDATE relay_jobs SET status='signed',raw_tx='0x1234' WHERE id=$1",[stop.id]));
 const next=await accept(-1,2n,4n);assert.equal(next.accepted,true);
 const racing=await Promise.all([accept(1,2n,5n),accept(0,2n,6n)]);assert.equal(racing[1].accepted,true);
 const rows=(await db.query("SELECT * FROM relay_jobs WHERE input_lane=$1 AND status IN ('queued','signed','sent')",[lane])).rows;
 assert.equal(rows.length,2);assert.equal(rows.find(r=>r.status==="signed").raw_tx,"0x1234");assert.equal(rows.find(r=>r.status==="queued").payload.args[0].direction,0);
 await assert.rejects(()=>accept(1,2n,7n,opponent),/Invalid/);
 valid=false;await assert.rejects(()=>accept(1,2n,7n),/revoked/);valid=true;
 const expired=await request(1,2n,7n);block+=17n;await assert.rejects(()=>inputs.accept({...expired[0],args:[...expired[0].args]},expired[1]),/expired/);
 await assert.rejects(()=>inputs.accept({contract:"vault",functionName:"withdraw",args:[]}),/Gameplay/);
 await db.query("UPDATE relay_jobs SET status='failed' WHERE id=$1",[stop.id]);
 assert.equal((await inputs.state("1",player.address)).nextNonce,1n);assert.equal((await accept(0,1n,8n)).accepted,true);
 console.log(JSON.stringify({passed:true,invalidSignatures:true,revoked:true,expired:true,financialDenied:true,outOfOrder:true,concurrent:true,immutableSignedBytes:true,failedPredecessorResign:true,superseded:events.length}));
}finally{await db.end();}

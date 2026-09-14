// The shipped SDK example, hosted in a separate private container, with its
// own creator and game keys. It does not impersonate a human or a house bot.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {agentMetrics} from '../relayer/src/agents/metrics';
assert.equal(process.env.AGENT_PRIVATE_QUALIFICATION,'isolated-vps');
const dir='/secrets/community-test';await mkdir(dir,{recursive:true,mode:0o700});
let keys:any;try{keys=JSON.parse(await readFile(dir+'/keys.json','utf8'));}catch(e){
 if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;
 keys={agent:generatePrivateKey(),creator:generatePrivateKey()};await writeFile(dir+'/keys.json',JSON.stringify(keys),{mode:0o600});
}
process.env.AGENT_KEY=keys.agent;process.env.CREATOR_KEY=keys.creator;
process.env.AGENT_API='http://pongit-agent-service-20260913:4100';process.env.AGENT_NAME='SDK Qualification';
process.env.AGENT_STATE=dir+'/session.json';
console.log(JSON.stringify({at:new Date().toISOString(),agent:privateKeyToAccount(keys.agent).address,creator:privateKeyToAccount(keys.creator).address,scope:'Shipped SDK example, dedicated private qualification'}));
const closeMetrics=process.env.PONG_AGENT_DIAGNOSTICS?await agentMetrics(process.env.PONG_AGENT_DIAGNOSTICS,'community'):async()=>{};
try{await import('../agent-sdk/example');}finally{await closeMetrics();}

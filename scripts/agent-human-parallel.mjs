// Use the existing public browser regression with disposable owners, alongside
// the dedicated agents. No user accounts, wagers or administrative writes.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
assert.equal(process.env.PONG_AGENT_HUMAN_PARALLEL,'authorized-testnet');
const config=await fetch('https://pongit.xyz/api/interlude/config').then(r=>r.json());
assert.equal(config.app,'0x78d3341e3452d7ec1add9371de3008639eed8eb0');assert(config.online&&config.admission);
const agents=await fetch('http://pongit-agent-service-20260913:4100/live').then(r=>r.json());
assert(agents.matches.some(m=>m.status==='active'),'Wait for actual dedicated agent traffic');
await mkdir('artifacts/drand',{recursive:true});
await writeFile('artifacts/drand/production-manifests.json',JSON.stringify({game:{app:config.app,node:config.node}}));
const child=spawn(process.execPath,['--import','tsx','scripts/chaos-real-browser.ts'],{stdio:'inherit',env:{...process.env,
 PONG_CHAOS_QUALIFY:'isolated-hosted-testnet',PONG_CHAOS_PRODUCTION_FIXTURE:'authorized-testnet-candidate',PONG_BROWSER_PUBLIC:'authorized-testnet-public',PONG_BROWSER_RUN:'9'}});
process.on('SIGTERM',()=>child.kill('SIGTERM'));
process.exitCode=await new Promise(resolve=>child.on('exit',code=>resolve(code??1)));

import test from 'node:test';
import assert from 'node:assert/strict';
import {
 ENGINE_COMMAND_GAS,ENGINE_COMMAND_GAS_FALLBACK,adoptServedEngineCommandGas,engineCommandGas,engineCommandGasFromEnv,engineCommandTransaction,parseEngineCommandGas,setEngineCommandGas,
} from '../shared/engine-gas';

test('the command gas limit: 30,000,000 by default, the operator may lower it without a rebuild, never raise it',()=>{
 assert.equal(engineCommandGasFromEnv({}),30_000_000n);
 assert.equal(engineCommandGasFromEnv({ROOMS_ENGINE_COMMAND_GAS:''}),30_000_000n);
 assert.equal(engineCommandGasFromEnv({ROOMS_ENGINE_COMMAND_GAS:'15000000'}),ENGINE_COMMAND_GAS_FALLBACK);
 assert.equal(engineCommandGasFromEnv({ROOMS_ENGINE_COMMAND_GAS:' 30000000 '}),30_000_000n);
 for(const bad of ['30000001','60000000','999999','15e6','15,000,000','-1','abc'])
  assert.throws(()=>engineCommandGasFromEnv({ROOMS_ENGINE_COMMAND_GAS:bad}),/ROOMS_ENGINE_COMMAND_GAS/,`${bad} stops startup`);
 for(const bad of [undefined,null,'',{},30_000_001,1.5,'0x1c9c380'])assert.equal(parseEngineCommandGas(bad),undefined,String(bad));
 assert.equal(parseEngineCommandGas(15_000_000),15_000_000n);assert.equal(parseEngineCommandGas('15000000'),15_000_000n);
});

test('the browser signs with the limit the relayer\'s config serves, and keeps its own on anything invalid',()=>{
 const app='0x0000000000000000000000000000000000000011';
 assert.equal(engineCommandGas(),ENGINE_COMMAND_GAS);
 try{
  assert.equal(setEngineCommandGas('15000000'),true);assert.equal(engineCommandGas(),15_000_000n);
  assert.equal(engineCommandTransaction(app,1,'0x').gas,15_000_000n,'the next control is signed at the served limit');
  assert.equal(engineCommandTransaction(app,1,'0x',30_000_000n).gas,30_000_000n,'the relayer passes its own');
  assert.equal(setEngineCommandGas(undefined),false,'an older relayer serves none');assert.equal(engineCommandGas(),15_000_000n);
  assert.equal(setEngineCommandGas('60000000'),false);assert.equal(engineCommandGas(),15_000_000n);
 }finally{setEngineCommandGas(ENGINE_COMMAND_GAS);}
 assert.equal(engineCommandGas(),30_000_000n);
});

test('a config that serves no limit comes from the release relayer: the tab signs its 15,000,000, never 30 M',()=>{
 const app='0x0000000000000000000000000000000000000011';
 try{
  // 853f174's /interlude/config has no commandGas: web deployed before the
  // relayer, or the relayer rolled back alone. That relayer neither signs 30 M
  // nor recognises a gas-cap refusal, so the tab must not sign 30 M either.
  assert.equal(adoptServedEngineCommandGas({online:true,stateTransport:'events'}),true);
  assert.equal(engineCommandGas(),ENGINE_COMMAND_GAS_FALLBACK);
  assert.equal(engineCommandTransaction(app,1,'0x').gas,15_000_000n);
  assert.equal(adoptServedEngineCommandGas({commandGas:null}),true);assert.equal(engineCommandGas(),15_000_000n);
  // This branch's relayer always serves one.
  assert.equal(adoptServedEngineCommandGas({commandGas:'30000000'}),true);assert.equal(engineCommandGas(),30_000_000n);
  assert.equal(adoptServedEngineCommandGas({commandGas:'60000000'}),false,'an invalid one keeps the current limit');assert.equal(engineCommandGas(),30_000_000n);
  for(const bad of [undefined,null,'text'])assert.equal(adoptServedEngineCommandGas(bad),false,String(bad));
  assert.equal(engineCommandGas(),30_000_000n,'no response keeps the current limit');
 }finally{setEngineCommandGas(ENGINE_COMMAND_GAS);}
});

test('the operator switches reach the relayer container, and every instruction says to recreate it',async()=>{
 const {readFile}=await import('node:fs/promises');
 const compose=await readFile('compose.yaml','utf8');
 const relayer=compose.slice(compose.indexOf('\n  relayer:'),compose.indexOf('\n  rpc:'));
 assert.match(relayer,/ROOMS_ENGINE_COMMAND_GAS: \$\{ROOMS_ENGINE_COMMAND_GAS:-\}/);
 assert.match(relayer,/ROOMS_LIFECYCLE_HOLD_RENEW: \$\{ROOMS_LIFECYCLE_HOLD_RENEW:-false\}/,'the renewal hold the runbook uses');
 assert.match(relayer,/ROOMS_STATE_STREAM_ENABLED/,'the Chaos guard runs only on the event stream');
 // docker compose restart keeps a container's old environment: a new limit only
 // applies once the container is recreated.
 for(const file of ['.env.example','shared/engine-gas.ts','relayer/src/interlude-rooms.ts']){
  const text=await readFile(file,'utf8');
  assert.match(text,/docker compose up -d --no-deps relayer/,file);
  assert(!/and restart the relayer/.test(text),`${file} must not say to restart the relayer`);
 }
});

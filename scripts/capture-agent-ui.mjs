import {mkdir,writeFile,cp} from 'node:fs/promises';
import assert from 'node:assert/strict';
assert.equal(process.env.PONG_AGENT_UI_CAPTURE,'isolated-vps');
const stamp=process.env.PONG_AGENT_LAB_STAMP??'20260913';assert.match(stamp,/^20\d{6}(-[2-9])?$/,'The laboratory stamp is a date such as 20260918');
const base=`http://pongit-agent-ui-${stamp}:3000`,out='artifacts/agents/ui';
await mkdir(out,{recursive:true});
// A capture is replayed against simulated APIs, so the address is deliberately
// synthetic. It must stay identical to the one agent-ui-browser.ts simulates.
const app=`0x${'7'.repeat(40)}`;
for(const [name,path] of [['home','/'],['agents','/agents'],['watch','/agents?view=watch'],['classic',`/agents?match=1&app=${app}&epoch=1&view=watch`],['chaos',`/agents?match=1&app=${app}&epoch=1&view=watch&mode=1`]]){
 const response=await fetch(base+path);assert(response.ok);await writeFile(`${out}/${name}.html`,await response.text());
}
await cp('web/.next/static',out+'/.next/static',{recursive:true});await cp('web/public',out+'/public',{recursive:true});
console.log(JSON.stringify({scope:'Captured private production build, no local service',out}));

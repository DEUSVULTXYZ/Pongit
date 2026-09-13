import {mkdir,writeFile,cp} from 'node:fs/promises';
import assert from 'node:assert/strict';
assert.equal(process.env.PONG_AGENT_UI_CAPTURE,'isolated-vps');
const base='http://pongit-agent-ui-20260913:3000',out='artifacts/agents/ui';
await mkdir(out,{recursive:true});
const app='0x4cecc7fb9f199fbd91dcc4a6e6ea7156e69247d9';
for(const [name,path] of [['home','/'],['agents','/agents'],['watch','/agents?view=watch'],['classic',`/agents?match=1&app=${app}&epoch=1&view=watch`],['chaos',`/agents?match=1&app=${app}&epoch=1&view=watch&mode=1`]]){
 const response=await fetch(base+path);assert(response.ok);await writeFile(`${out}/${name}.html`,await response.text());
}
await cp('web/.next/static',out+'/.next/static',{recursive:true});await cp('web/public',out+'/public',{recursive:true});
console.log(JSON.stringify({scope:'Captured private production build, no local service',out}));

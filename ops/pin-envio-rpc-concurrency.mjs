// Narrow, pinned compatibility patch for the installed Envio 3.9.0 runtime.
// Its chain fetch concurrency is a hard-coded 100, not a configuration option.
// Each fetch can fan out into many eth_getLogs calls. Keep this below the
// private RPC gateway's queue budget instead of discarding/retrying whole scans.
// No handler, block range, schema, RPC rate or database is changed.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,rename,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';

const [directory,value]=process.argv.slice(2),limit=Number(value);
assert(directory&&/^[1-8]$/.test(value)&&Number.isInteger(limit),'Use an explicit Envio package directory and concurrency 1..8');
const root=resolve(directory),file=join(root,'src','Env.res.mjs');
const expected='55aa3659411810ba518a786c813a50310bf5dade3b21050faca66578402a5ce2';
const hash=s=>createHash('sha256').update(s).digest('hex');
assert.equal(JSON.parse(await readFile(join(root,'package.json'),'utf8')).version,'3.9.0','Review this patch before upgrading Envio');
const originalLine='let maxChainConcurrency = 100;',replacement=`let maxChainConcurrency = ${limit};`;
const source=await readFile(file,'utf8');
const original=source.replace(replacement,originalLine);
assert.equal(hash(original),expected,'Unexpected Envio runtime; no file was changed');
assert.equal(original.split(originalLine).length,2,'Expected one concurrency declaration');
const patched=original.replace(originalLine,replacement);
assert(source===original||source===patched,'Mixed patch; no file was changed');
let changed=false;
if(source!==patched){
 const backup=file+'.pongit-original';
 try{await writeFile(backup,original,{flag:'wx',mode:(await stat(file)).mode&0o777});}
 catch(e){if(e.code!=='EEXIST')throw e;assert.equal(hash(await readFile(backup)),expected,'Preserve the existing original backup');}
 const temporary=file+'.pongit-next';
 await writeFile(temporary,patched,{flag:'wx',mode:(await stat(file)).mode&0o777});
 assert.equal(await readFile(file,'utf8'),source,'Concurrent runtime edit; review the staged patch');
 await rename(temporary,file);changed=true;
}
console.log(JSON.stringify({package:'envio',version:'3.9.0',concurrency:limit,originalSha256:expected,patchedSha256:hash(patched),changed}));

import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('the installed Next config loader resolves the shared browser policy',()=>{
 const code=`const p=require('node:path');
 require('next/dist/build/next-config-ts/transpile-config').transpileConfig({dir:p.resolve('web'),nextConfigPath:p.resolve('web/next.config.ts')})
 .then(async loaded=>{const config=loaded.default??loaded;const rows=await config.headers();
 if(!rows.some(r=>r.headers.some(h=>h.key==='Content-Security-Policy'&&h.value.includes("object-src 'none'"))))throw Error('Policy missing');
 console.log('configuration-policy-loaded');}).catch(e=>{console.error(e.message);process.exitCode=1;});`;
 const result=spawnSync(process.execPath,['-e',code],{cwd:process.cwd(),encoding:'utf8',timeout:30000});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/configuration-policy-loaded/);
});

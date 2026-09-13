import {readdir,mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
assert.equal(process.env.PONG_AGENT_UNIT_TEST,'isolated-vps');
const files=(await readdir('tests')).filter(x=>x.endsWith('.test.ts')).map(x=>'tests/'+x);
const child=spawn(process.execPath,['--import','tsx','--test','--test-reporter=tap',...files],{stdio:['ignore','pipe','pipe'],windowsHide:true});let log='';
child.stdout.on('data',b=>{log+=b;});child.stderr.on('data',b=>{log+=b;});
const code=await new Promise(resolve=>child.on('exit',resolve));await mkdir('artifacts/agents',{recursive:true});await writeFile('artifacts/agents/typescript-tests.log',log);
console.log(log.split('\n').filter(s=>/^[#ℹ] (tests|suites|pass|fail|cancelled|skipped|duration)/.test(s)||s.startsWith('not ok')).join('\n'));process.exitCode=code??1;

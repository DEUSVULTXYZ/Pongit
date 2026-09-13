// Private operator role. It shares the existing Monad nonce journal, never the
// house-bot keys. Results and lifecycle are independent bounded processes.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
assert.equal(process.env.PONG_AGENT_OPERATIONS,'dedicated-authorized');
let stopping=false;const children=new Set();
process.on('SIGTERM',()=>{stopping=true;for(const child of children)child.kill('SIGTERM');});
async function run(script,extra){await new Promise(resolve=>{
 const child=spawn(process.execPath,['--import','tsx',script],{env:{...process.env,...extra},stdio:['ignore','pipe','pipe']});children.add(child);
 let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{output+=b.toString();if(output.length>30000)output=output.slice(-30000);});
 child.once('exit',code=>{children.delete(child);for(const line of output.split('\n'))if(line.startsWith('{')){try{console.log(JSON.stringify(JSON.parse(line)));}catch{}}
  if(code)console.error(JSON.stringify({at:new Date().toISOString(),service:'agent-ops',script,error:output.split('\n').filter(x=>/Error:|AssertionError/.test(x)).slice(-1).join('').replace(/0x[\da-fA-F]{64,}/g,'[omitted]').slice(0,220)||'Operation interrupted; the journal will be reconciled'}));resolve();});
 child.once('error',()=>{children.delete(child);resolve();});
});}
async function loop(script,env){while(!stopping){await run(script,env);if(!stopping)await new Promise(resolve=>{const done=()=>{clearTimeout(timer);process.off('SIGTERM',done);resolve();};const timer=setTimeout(done,60000);process.once('SIGTERM',done);});}}
await Promise.all([loop('scripts/agent-lifecycle.ts',{PONG_AGENT_LIFECYCLE:'maintenance'}),loop('scripts/agent-archive-step.ts',{PONG_AGENT_ARCHIVE:'dedicated-authorized'})]);

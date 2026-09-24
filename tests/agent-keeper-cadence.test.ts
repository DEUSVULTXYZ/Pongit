import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {operatorBusy,writeRetryMs} from '../relayer/src/agents/pool-maintenance';
import {replacementBudget,DEAD_ARENA_MAX_REPLACEMENTS} from '../shared/arena-replacement';

// The supervisor is plain JavaScript run by node; load it without type declarations.
const {superviseRole}=await import('../scripts/agent-role-supervisor.mjs' as string) as any;

type Fake=EventEmitter&{exitCode:number|null;signalCode:string|null;options:any;sent:string[];send(m:string):void;kill(signal:string):void};
function fakeSpawn(behave:(child:Fake,index:number)=>void){
 const children:Fake[]=[],order:string[]=[];
 const spawn=(_cmd:string,_args:string[],options:any)=>{
  const child=Object.assign(new EventEmitter(),{exitCode:null,signalCode:null,options,sent:[] as string[]}) as Fake;
  const index=children.length;
  child.send=m=>{child.sent.push(m);order.push(`go:${index}`);child.emit('go');};
  child.kill=signal=>{if(child.exitCode!==null)return;queueMicrotask(()=>{child.exitCode=1;child.signalCode=signal;order.push(`exit:${index}`);child.emit('exit',null,signal);});};
  children.push(child);order.push(`spawn:${index}`);queueMicrotask(()=>behave(child,index));
  return child;
 };
 const exit=(child:Fake,index:number,code=0)=>{child.exitCode=code;order.push(`exit:${index}`);child.emit('exit',code);};
 return {spawn,children,order,exit};
}

test('a pre-started keeper step waits for its turn and never overlaps the running one',async()=>{
 let pauses=0,running=0,maxRunning=0;
 const f=fakeSpawn((child,index)=>{
  child.emit('message','ready');
  child.once('go',()=>{running++;maxRunning=Math.max(maxRunning,running);setImmediate(()=>{running--;f.exit(child,index);});});
 });
 const supervisor=superviseRole({role:'keeper',entry:'scripts/agent-reusable-step.ts',spawn:f.spawn,prestart:true,
  sleep:async()=>{if(++pauses===3)supervisor.stop();},log:()=>{}});
 await supervisor.done;
 assert.equal(maxRunning,1,'two step bodies never run at once');
 assert.deepEqual(f.children.slice(0,3).map(c=>c.sent),[['go'],['go'],['go']]);
 assert.equal(f.children[0].options.env.PONG_KEEPER_PRESTARTED,'1');
 assert.deepEqual(f.children[0].options.stdio,['inherit','inherit','inherit','ipc']);
 // Each next process is spawned only after the previous step exited, and loads during the pause.
 assert.ok(f.order.indexOf('spawn:1')>f.order.indexOf('exit:0'));
 assert.ok(f.order.indexOf('spawn:2')>f.order.indexOf('exit:1'));
 assert.equal(f.children.at(-1)!.sent.length,0,'the waiting step is stopped, never released');
});

test('a pre-started step that never reports ready is stopped and counted as a failure',async()=>{
 const logs:string[]=[];let pauses=0;
 const f=fakeSpawn((child,index)=>{if(index>0){child.emit('message','ready');child.once('go',()=>setImmediate(()=>f.exit(child,index)));}});
 const supervisor=superviseRole({role:'keeper',entry:'x',spawn:f.spawn,prestart:true,readyTimeoutMs:5,
  sleep:async()=>{if(++pauses===2)supervisor.stop();},log:(line:string)=>logs.push(line)});
 await supervisor.done;
 assert.equal(f.children[0].signalCode,'SIGTERM');assert.equal(f.children[0].sent.length,0);
 assert.equal(JSON.parse(logs[0]).event,'role-restarting');
 assert.deepEqual(f.children[1].sent,['go']);
});

test('long-lived services restart as before, without any IPC channel',async()=>{
 let pauses=0;
 const f=fakeSpawn((child,index)=>setImmediate(()=>f.exit(child,index)));
 const supervisor=superviseRole({role:'engines',entry:'x',spawn:f.spawn,sleep:async()=>{if(++pauses===2)supervisor.stop();},log:()=>{}});
 await supervisor.done;
 assert.equal(f.children.length,2);assert.equal(f.children[0].options.stdio,'inherit');assert.equal(f.children[0].sent.length,0);
});

test('a busy operator key costs three seconds, a revert still thirty',()=>{
 assert.equal(operatorBusy(Error('Operator is busy; retry without creating another operation')),true);
 assert.equal(operatorBusy(Error('Reconcile the existing operator transaction first')),true);
 assert.equal(operatorBusy(Error('Operator nonce is in use')),true);
 assert.equal(writeRetryMs(Error('Operator nonce is in use')),3000);
 assert.equal(writeRetryMs(Error('execution reverted: challenge lane waiting')),30000);
});

test('an arena is replaced at most twice a day',()=>{
 const now=10*86_400_000;
 assert.deepEqual(replacementBudget(undefined,now),{recent:[],allowed:true});
 assert.equal(replacementBudget([now-1000,now-2000],now).allowed,DEAD_ARENA_MAX_REPLACEMENTS>2);
 assert.deepEqual(replacementBudget([now-86_400_000,now-1000],now),{recent:[now-1000],allowed:true},'a day-old replacement no longer counts');
});

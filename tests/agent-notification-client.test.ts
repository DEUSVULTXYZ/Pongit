import {test} from 'node:test';
import assert from 'node:assert/strict';
import {watchAgentChanges,type AgentChanges} from '../web/lib/agent-notifications';

test('coalesced notifications retain every changed topic and stop on unmount',async()=>{
 const original=globalThis.EventSource;let source:FakeSource;
 class FakeSource {
  listener!:(event:any)=>void;closed=false;
  constructor(){source=this;}
  addEventListener(_name:string,listener:(event:any)=>void){this.listener=listener;}
  close(){this.closed=true;}
  change(changed:string[],revision:string,resync=false){this.listener({data:JSON.stringify({version:1,resync,changed,revisions:{revision}})});}
 }
 globalThis.EventSource=FakeSource as any;
 const seen:AgentChanges[]=[],stop=watchAgentChanges(value=>seen.push(value));
 try{
  source!.change(['challenges/account'],'a',true);source!.change(['catalog'],'b');
  await new Promise(resolve=>setTimeout(resolve,130));
  assert.deepEqual(seen,[{resync:true,changed:['challenges/account','catalog']}]);
  source!.change(['live'],'b');await new Promise(resolve=>setTimeout(resolve,130));assert.equal(seen.length,1);
  source!.change(['live'],'c');stop();await new Promise(resolve=>setTimeout(resolve,130));assert.equal(seen.length,1);assert(source!.closed);
 }finally{stop();globalThis.EventSource=original;}
});

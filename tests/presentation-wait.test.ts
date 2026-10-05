import test from 'node:test';
import assert from 'node:assert/strict';
import {presentationWait,reconnectingPresentation} from '../web/lib/presentation-wait';
test('normal points, serves and bounded prediction do not masquerade as network recovery',()=>{
 for(const change of [{point:true},{serve:true},{draw:true},{projection:true},{paused:true}]){
  const cause=presentationWait({stale:false,point:false,serve:false,projection:false,...change});
  assert(cause);assert.equal(reconnectingPresentation(cause),false);
 }
 assert.equal(presentationWait({stale:false,point:true,serve:false,projection:true}),'point-pending');
});
test('a genuinely stale or interrupted point still exposes recovery',()=>{
 for(const change of [{stale:true},{interrupted:true}]){
  const cause=presentationWait({stale:false,point:true,serve:false,projection:true,...change});
  assert.equal(reconnectingPresentation(cause),true);
 }
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import type {ServerResponse} from 'node:http';
import {PoolNotifications} from '../relayer/src/agents/pool-notifications';
class Response extends EventEmitter {
 chunks:string[]=[];ended=false;
 writeHead(){return this;}write(s:string){this.chunks.push(s);return true;}
 end(){this.ended=true;this.emit('close');}
 messages(){return this.chunks.filter(x=>x.startsWith('event:')).map(x=>JSON.parse(x.split('data: ')[1]));}
}
test('notifications are shared, unchanged views stay quiet and reconnect reloads the full view',async()=>{
 let revision='a';const calls:string[]=[];
 const hub=new PoolNotifications(async url=>{calls.push(url.pathname);return{revision,value:{enabled:true,privateFixture:'never sent'}};},true);
 const a=new Response(),b=new Response();hub.add(a as unknown as ServerResponse,null);hub.add(b as unknown as ServerResponse,null);
 await hub.tick();assert.equal(calls.length,4);assert.equal(a.messages()[0].resync,true);assert.equal(b.messages()[0].resync,true);
 await hub.tick();assert.equal(a.messages().length,1);assert.equal(calls.length,8);
 revision='b';await hub.tick();assert.equal(a.messages().length,2);assert.equal(a.messages()[1].resync,false);
 a.end();const c=new Response();hub.add(c as unknown as ServerResponse,null);await hub.tick();assert.equal(c.messages()[0].resync,true);
 assert(!a.chunks.join('').includes('never sent'));hub.close();assert(b.ended&&c.ended);
});
test('failed reads retain state and closing admissions delivers a change without disconnecting spectators',async()=>{
 let open=true,fail=false;const hub=new PoolNotifications(async url=>{
  if(fail&&url.pathname.endsWith('/live'))throw Error('RPC timeout');return{revision:!open?'closed':fail?'b':'a',value:{enabled:open}};
 },true);const a=new Response();hub.add(a as unknown as ServerResponse,null);await hub.tick();fail=true;await hub.tick();
 assert(!a.messages()[1].changed.includes('live'));assert.equal(a.messages()[1].revisions.live,'a');
 open=false;await hub.tick();assert(!a.ended);assert(a.messages().at(-1).changed.includes('config'));hub.close();
});

test('a ready challenge is delivered while the catalogue remains slow',async()=>{
 let release!:()=>void;const slow=new Promise<void>(resolve=>{release=resolve;});
 const account='0x1111111111111111111111111111111111111111';
 const hub=new PoolNotifications(async url=>{
  if(url.pathname.endsWith('/catalog'))await slow;
  return{revision:'ready',value:{privateGrant:'never send'}};
 },true);
 const response=new Response();hub.add(response as unknown as ServerResponse,account);
 try{
  await new Promise(resolve=>setImmediate(resolve));
  assert(response.messages().some(m=>m.changed.includes(`challenges/${account}`)));
  assert(!response.messages().some(m=>m.changed.includes('catalog')));
  assert(!response.chunks.join('').includes('privateGrant'));
  release();await hub.tick();assert(response.messages().some(m=>m.changed.includes('catalog')));
 }finally{release();hub.close();}
});

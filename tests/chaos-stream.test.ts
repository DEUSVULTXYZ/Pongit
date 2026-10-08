import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodeAbiParameters,encodeEventTopics,zeroAddress,zeroHash,type Hex,type Address} from 'viem';
import {roomsEventsAbi as abi} from '../shared/abi-PongChaosEvents';
import {engineState,mergeEngineFrame,type EngineFrame} from '../shared/engine-stream';
import {decodeChaosRead,unpackChaos,chaosLegacy,retainedChaosCollisions} from '../shared/chaos-codec';
import {reusableAgentArenaAbi} from '../shared/abi-ReusableAgentArena';
import {abi as reusableHumanAbi} from '../shared/abi-independent-ReusableEventsArena';

const app='0x1111111111111111111111111111111111111111',a='0x2222222222222222222222222222222222222222',b='0x3333333333333333333333333333333333333333';
const words=[512000000000000n|(288000000000000n<<56n)|(1n<<112n)|(1n<<128n)|(2n<<168n)|(1n<<195n),192000000n|(96000000n<<80n),
 0n,0n,0n,0n,288000000000000n|(288000000000000n<<56n)|(100000n<<112n)|(100000n<<176n),
 (1n<<6n)|(1n<<41n)|(1n<<43n)|(96000000n<<101n)|(96000000n<<133n)] as const;
const physics=unpackChaos(words,zeroHash,5n),header=[1n,5n,2n,a,b,b,zeroAddress,100n,100000n,3n,4n,100000n,chaosLegacy(physics)] as const;
const previous=()=>engineState([...header,{physics,request:10n,pending:0n,collisions:[]}],1000);
function log(name:string,args:Record<string,unknown>){
 const ev=abi.find(x=>x.type==='event'&&x.name===name) as any;
 return {address:app as Address,topics:encodeEventTopics({abi:abi as any,eventName:name,args}) as Hex[],data:encodeAbiParameters(ev.inputs.filter((x:any)=>!x.indexed),ev.inputs.filter((x:any)=>!x.indexed).map((x:any)=>args[x.name]))};
}
const frame=(logs:EngineFrame['logs']):EngineFrame=>({app,hash:zeroHash,head:110n,logs});
const advancedWords:[bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint]=[...words];advancedWords[6]=(words[6]&~(((1n<<64n)-1n)<<112n))|(200000n<<112n);advancedWords[7]=words[7]|(1n<<69n);
const snapshot=(version=6n)=>log('Snapshot',{id:1n,version,status:2n,state:encodeAbiParameters([{type:'uint8'},{type:'uint256'},{type:'uint256[8]'}],[6,6n|(8n<<16n)|(9n<<80n),advancedWords])});

test('public Chaos944 collision remains visible when another tick or full read overtakes its paint',()=>{
 const hit=1n|(1n<<32n)|(1n<<64n)|(4n<<72n)|(150000n<<88n);
 const logs=[log('ChaosCollision',{id:1n,collision:hit}),snapshot()];
 const contact=mergeEngineFrame(abi,app,previous(),frame(logs),1020).state;
 const following=mergeEngineFrame(abi,app,contact,frame([snapshot(7n)]),1030).state;
 assert.equal(following.chaos?.collisions.length,1,'an empty next tick must not erase the hit before paint');
 const getter={...following,chaos:{...following.chaos!,collisions:[]}};
 const late=mergeEngineFrame(abi,app,getter,frame(logs),1040);
 assert(late.changed);assert.equal(late.state.revision,getter.revision);assert.equal(late.state.observedAt,getter.observedAt);
 assert.equal(late.state.state,getter.state,'late evidence cannot rewind live physics');
 assert.equal(late.state.chaos?.collisions[0].kind,4);
 assert.equal(mergeEngineFrame(abi,app,late.state,frame(logs),1050).changed,false,'duplicate receipt adds no duplicate impact');
 const rehydrated=retainedChaosCollisions(getter.chaos.physics,late.state.chaos!.collisions,[]);
 assert.equal(rehydrated.length,1,'atomic consistency read retains known evidence');
 assert.equal(retainedChaosCollisions({...getter.chaos.physics,t:149999n},rehydrated).length,0,'future collisions are never shown');
 assert.equal(retainedChaosCollisions({...getter.chaos.physics,collisionSequence:0},rehydrated).length,0,'reset counter rejects old event evidence');
 const many=Array.from({length:100},(_,i)=>({...rehydrated[0],sequence:i+1}));
 assert.equal(retainedChaosCollisions({...getter.chaos.physics,collisionSequence:100},many).length,64,'bounded history');
});

test('both reusable ABIs retain linked Chaos snapshots, random draws and collision identities',()=>{
 for(const current of [reusableAgentArenaAbi,reusableHumanAbi]){
  const next=mergeEngineFrame(current,app,previous(),frame([log('RandomnessVerified',{id:1n,index:1,round:10n,randomness:zeroHash,draw:22n}),log('ChaosCollision',{id:1n,collision:1n|(1n<<32n)|(1n<<72n)}),snapshot()]));
  assert.equal(next.resync,false);assert.equal(next.state.nonceA,8n);assert.equal(next.state.nonceB,9n);assert.equal(next.state.chaos?.pending,22n);assert.equal(next.state.chaos?.collisions[0].sequence,1);
 }
});
test('atomic read and push preserve second-ball state, real rally, explicit nonces and draw state',()=>{
 const getter=abi.find(x=>x.type==='function'&&x.name==='getSnapshot')! as any;
 const read=encodeAbiParameters([{type:'tuple',components:getter.outputs.map((x:any,i:number)=>({...x,name:`f${i}`}))},{type:'uint256[8]'},{type:'uint256'},{type:'uint256'}],[header,words,10n,0n]);
 const decoded=engineState(decodeChaosRead(abi,read));assert.deepEqual(decoded.chaos?.physics,physics);assert.equal(decoded.nonceA,3n);
 const hit=1n|(1n<<32n)|(1n<<64n)|(1n<<72n)|(150000n<<88n);
 const next=mergeEngineFrame(abi,app,previous(),frame([log('RandomnessVerified',{id:1n,index:1,round:10n,randomness:zeroHash,draw:22n}),log('ChaosCollision',{id:1n,collision:hit}),snapshot()]));
 assert.equal(next.resync,false);assert.equal(next.state.nonceA,8n);assert.equal(next.state.nonceB,9n);assert.equal(next.state.state.leftDir,1);
 assert.equal(next.state.chaos?.pending,22n);assert.equal(next.state.chaos?.physics.score.rally,1);assert.equal(next.state.chaos?.collisions[0].sequence,1);
 assert.equal(mergeEngineFrame(abi,app,next.state,frame([snapshot()])).changed,false);
});
test('a discontinuity cannot guess a new draw or final result from partial event state',()=>{
 assert.equal(mergeEngineFrame(abi,app,previous(),frame([snapshot(7n)])).resync,true);
 const next=mergeEngineFrame(abi,app,previous(),frame([log('EventRequested',{id:1n,request:20n}),snapshot()]));
 assert.equal(next.state.chaos?.request,20n);assert.equal(next.state.chaos?.pending,0n);
 const foreign=log('EventRequested',{id:2n,request:99n});
 assert.equal(mergeEngineFrame(abi,app,previous(),frame([foreign,snapshot()])).state.chaos?.request,10n);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hostedControl,hostedArenaOrigin,LEGACY_HOSTED_HUB} from '../shared/hosted-control';
import {NO_LEASE_HUB} from '../shared/hub-lease';
import {controlPlaneAnswers} from '../relayer/src/agents/pool-maintenance';
const legacy={hub:LEGACY_HOSTED_HUB,chainId:10143,validator:'0xB28E684815b095aB5Fb324214cfEa63d76F3d691'};
test('origin hints remain hub-specific and never turn unknown deployments into hosted engines',()=>{
 const app='0x1111111111111111111111111111111111111111';
 assert.equal(hostedArenaOrigin(LEGACY_HOSTED_HUB,app),'https://il-1111111111111111.fly.dev');
 assert.equal(hostedArenaOrigin(NO_LEASE_HUB,app),'https://il2-eu-1111111111111111.fly.dev');
 assert.throws(()=>hostedArenaOrigin(app,app),/Unsupported/);
});
test('partner hub uses the old control even when the public hostname serves another hub',async()=>{
 const urls:string[]=[];const transport=(async input=>{urls.push(String(input));return Response.json(legacy);}) as typeof fetch;
 assert.equal(await hostedControl(LEGACY_HOSTED_HUB,transport),'https://interlude-control.fly.dev');
 assert.deepEqual(urls,['https://interlude-control.fly.dev/config']);
});
test('wrong hub, chain, validator and unavailable configuration fail closed',async()=>{
 for(const body of [{...legacy,hub:'0x98922c6E5e4Bea62761C71D2401c7ec2c26eC43e'},{...legacy,chainId:4242},
  {...legacy,validator:'0x0000000000000000000000000000000000000011'},{...legacy,chainId:'10143'},{}]){
  const urls:string[]=[];const transport=(async input=>{urls.push(String(input));return Response.json(body);}) as typeof fetch;
  assert.equal(await controlPlaneAnswers(LEGACY_HOSTED_HUB,transport),false);assert.equal(urls.length,1);
 }
 await assert.rejects(hostedControl(LEGACY_HOSTED_HUB,(async()=>new Response('',{status:503})) as typeof fetch));
 let calls=0;await assert.rejects(hostedControl('0x0000000000000000000000000000000000000001',(async()=>{calls++;throw Error();}) as typeof fetch));
 assert.equal(calls,0);
});
test('only matching configuration is coalesced and cached briefly; failures retry',async()=>{
 let calls=0,bad=true;const transport=(async()=>{calls++;return Response.json(bad?{}:legacy);}) as typeof fetch;
 await assert.rejects(hostedControl(LEGACY_HOSTED_HUB,transport,1000));bad=false;
 await Promise.all([hostedControl(LEGACY_HOSTED_HUB,transport,2000),hostedControl(LEGACY_HOSTED_HUB,transport,2000)]);
 assert.equal(calls,2);await hostedControl(LEGACY_HOSTED_HUB,transport,31999);assert.equal(calls,2);
 await hostedControl(LEGACY_HOSTED_HUB,transport,32000);assert.equal(calls,3);
});
test('voluntary rotation accepts an unknown session only from the matching healthy control',async()=>{
 for(const [status,expected] of [[200,true],[404,true],[401,false],[403,false],[429,false],[503,false]] as const){
  const urls:string[]=[];const transport=(async input=>{urls.push(String(input));return String(input).endsWith('/config')?Response.json(legacy):Response.json({}, {status});}) as typeof fetch;
  assert.equal(await controlPlaneAnswers(LEGACY_HOSTED_HUB,transport),expected);
  assert(urls.every(u=>u.startsWith('https://interlude-control.fly.dev/')));
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {PUBLIC_DEMO_FLOORS} from '@interludelayer-sdk/sdk';
import {INTERLUDE_REGIONS,latencyBucket} from '../shared/interlude-regions';
import {probeRegions,regionLatency} from '../web/lib/region-probe';
import {regionProbeRoutes,summarizeRegionProbes} from '../relayer/src/region-probe';

test('the probed regions are exactly the Interlude SDK floors',()=>{
 assert.deepEqual(
  INTERLUDE_REGIONS.map(({region,city,node})=>({region,city,node})),
  Object.values(PUBLIC_DEMO_FLOORS).map(({region,city,node})=>({region,city,node})));
});

test('latencies are only kept in 10 ms steps up to one second',()=>{
 assert.equal(latencyBucket(0),0);
 assert.equal(latencyBucket(44),40);
 assert.equal(latencyBucket(45),50);
 assert.equal(latencyBucket(-3),0);
 assert.equal(latencyBucket(4321),1000);
});

test('the first request only warms the connection and the best timed one is kept',async()=>{
 const times=[180,52,47];let calls=0;
 assert.equal(await regionLatency('https://node/health',async()=>times[calls++]),47);
 assert.equal(calls,3);
 assert.equal(await regionLatency('https://node/health',async()=>{throw Error('offline');}),undefined);
});

const pingFrom=(rtt:Record<string,number|undefined>)=>{
 const asked:string[]=[];
 const ping=async(url:string)=>{
  asked.push(url);
  const region=INTERLUDE_REGIONS.find(r=>url===`${r.node}/health`)!.region;
  const ms=rtt[region];
  if(ms===undefined)throw Error('unreachable');
  return ms;
 };
 return {ping,asked};
};

test('a probe reports the nearest region and the round trip to the Paris arenas',async()=>{
 const {ping,asked}=pingFrom({us:190,ny:31.6,eu:88.2,asia:230,tokyo:250,mumbai:170,africa:220,sa:140});
 assert.deepEqual(await probeRegions(ping),{region:'ny',ms:32,homeMs:88});
 assert.equal(asked.length,24,'one warm-up and two timed requests per region');
 assert.ok(asked.every(url=>url.endsWith('/health')));
});

test('an unreachable region is skipped, but without Paris there is nothing to compare',async()=>{
 assert.deepEqual(await probeRegions(pingFrom({eu:40,ny:95}).ping),{region:'eu',ms:40,homeMs:40});
 assert.equal(await probeRegions(pingFrom({ny:30,us:80}).ping),undefined);
});

test('a tab hidden during the probe discards it and stops timing',async()=>{
 const {ping,asked}=pingFrom({us:190,ny:30,eu:88,asia:230,tokyo:250,mumbai:170,africa:220,sa:140});
 let visible=true;
 const hiding=async(url:string)=>{const ms=await ping(url);if(asked.length===6)visible=false;return ms;};
 assert.equal(await probeRegions(hiding,()=>visible),undefined);
 assert.equal(asked.length,6,'no region is timed once the tab is hidden');
});

test('the operator table weighs every sample and shows what a local arena would save',()=>{
 const summary=summarizeRegionProbes([
  {region:'eu',ms:30,home_ms:30,samples:6},
  {region:'eu',ms:40,home_ms:40,samples:'2'},
  {region:'ny',ms:30,home_ms:90,samples:1},
  {region:'ny',ms:20,home_ms:110,samples:3},
 ]);
 assert.equal(summary.home,'eu');
 assert.equal(summary.samples,12);
 assert.equal(summary.slowHomeShare,3/12,'only the samples at 100 ms or more from Paris');
 assert.equal(summary.regions.length,8,'every region is listed, even without samples');
 const [eu,ny]=summary.regions;
 assert.deepEqual(eu,{region:'eu',city:'Paris',samples:8,share:8/12,medianMs:30,medianHomeMs:30,medianGainMs:0});
 assert.deepEqual(ny,{region:'ny',city:'New York',samples:4,share:4/12,medianMs:20,medianHomeMs:110,medianGainMs:90});
 assert.deepEqual(summary.regions[2],{region:'us',city:'California',samples:0,share:0,medianMs:null,medianHomeMs:null,medianGainMs:null});
});

const harness=(rows:any[]=[])=>{
 const queries:{sql:string;args:unknown[]}[]=[],sent:{value:any;status?:number}[]=[];
 let body:unknown={};
 const route=regionProbeRoutes({
  db:{query:async(sql,args)=>{queries.push({sql,args});return {rows:/^SELECT/.test(sql)?rows:[]};}},
  readBody:async()=>body,
  send:(_res,value,status)=>{sent.push({value,status});},
  now:()=>new Date('2026-09-23T21:30:00Z'),
 });
 const call=(method:string,url:string,payload?:unknown)=>{body=payload;return route({method,url} as any,{} as any,new URL(url,'http://x').pathname);};
 return {call,queries,sent};
};

test('a sample is stored as a daily count of rounded latencies, never as a raw row',async()=>{
 const {call,queries,sent}=harness();
 assert.equal(await call('POST','/region-probe',{region:'ny',ms:31.6,homeMs:88.2}),true);
 assert.equal(queries.length,1);
 assert.match(queries[0].sql,/ON CONFLICT \(day,region,ms,home_ms\) DO UPDATE SET samples=region_probe_daily\.samples\+1/);
 assert.deepEqual(queries[0].args,['2026-09-23','ny',30,90]);
 assert.deepEqual(sent,[{value:{ok:true},status:undefined}]);
});

test('a sample naming an unknown region or an impossible latency is refused before any write',async()=>{
 const {call,queries}=harness();
 await assert.rejects(call('POST','/region-probe',{region:'moon',ms:10,homeMs:10}));
 await assert.rejects(call('POST','/region-probe',{region:'eu',ms:-1,homeMs:10}));
 await assert.rejects(call('POST','/region-probe',{region:'eu',ms:10}));
 assert.equal(queries.length,0);
});

test('the operator read prunes old days and clamps the window',async()=>{
 const {call,queries,sent}=harness([{region:'eu',ms:40,home_ms:40,samples:3}]);
 assert.equal(await call('GET','/region-probe'),true);
 assert.deepEqual(queries.map(q=>q.args),[['2026-06-25'],['2026-08-25']],'90 days kept, 30 shown by default');
 assert.equal(sent[0].value.days,30);
 assert.equal(sent[0].value.samples,3);
 await call('GET','/region-probe?days=7');await call('GET','/region-probe?days=4000');await call('GET','/region-probe?days=nope');
 assert.deepEqual(sent.slice(1).map(s=>s.value.days),[7,90,30]);
 assert.equal(queries[3].args[0],'2026-09-17','a 7-day window includes today');
});

test('other paths and methods are left to the rest of the API',async()=>{
 const {call,queries}=harness();
 assert.equal(await call('GET','/region-probes'),false);
 assert.equal(await call('DELETE','/region-probe'),false);
 assert.equal(queries.length,0);
});

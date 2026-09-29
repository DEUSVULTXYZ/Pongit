import {readFile,writeFile} from 'node:fs/promises';
import {SpectatorPlayout} from '../web/lib/spectator-playout';
import {projectLive} from '../web/lib/presentation';
import {SpectatorChaosProjection} from '../web/lib/chaos-presentation';
import {chaosLegacy} from '../shared/chaos-codec';
import type {State} from '../shared/physics-v2';

const path=process.argv[2];if(!path?.endsWith('/sync-trace.json'))throw Error('Pass a public sync trace');
const trace=JSON.parse(await readFile(path,'utf8'));
const source=(v:any):State=>Object.fromEntries(Object.entries(v).map(([k,x])=>[k,typeof x==='string'&&/^-?\d+$/.test(x)?BigInt(x):x])) as State;
const timeline=new SpectatorPlayout(true),chaos=new SpectatorChaosProjection();
let i=0,last:any,hold=0,maxHold=0;const jumps:any[]=[],frames:any[]=[];
for(let at=trace.snapshots[0].at;at<trace.snapshots.at(-1).at;at+=16.667){
 while(i<trace.snapshots.length&&trace.snapshots[i].at<=at){
  const s=trace.snapshots[i++];
  const c=s.chaos?JSON.parse(JSON.stringify(s.chaos),(_,x)=>typeof x==='string'&&/^-?\d+$/.test(x)?BigInt(x):x):undefined;
  timeline.push({state:source(s.state),chaos:c,at:s.at});
 }
 const p=timeline.sample(at);if(!p)continue;
 const projected=p.frame.chaos?chaosLegacy(chaos.sample(p.frame.chaos.physics,p.target,'complete').state,p.frame.state.finished):projectLive(p.frame.state,p.target).state;
 const f={at,x:Number(projected.x)/1e6,y:Number(projected.y)/1e6,t:Number(projected.t)/1000,
  score:`${projected.scoreA}:${projected.scoreB}`,finished:projected.finished};
 if(last&&!last.finished&&!f.finished){const d=Math.hypot(f.x-last.x,f.y-last.y);
  if(d<.05)hold+=f.at-last.at;else{maxHold=Math.max(maxHold,hold);hold=0;}
  if(last.score===f.score&&d>30)jumps.push({at,d,from:[last.x,last.y],to:[f.x,f.y]});
 }
 frames.push(f);last=f;
}
console.log(JSON.stringify({frames:frames.length,maxHoldMs:Math.max(maxHold,hold),jumps}));

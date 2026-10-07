// Matched incoming-shot calibration, not a hosted-match qualification.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {toHex} from 'viem';
import {initial,advance,type State} from '../shared/physics-v2';
import {initialChaosEvents,advanceChaosEvents,type ChaosPhysicsState} from '../shared/physics-chaos-events';
import {responsiveState} from '../shared/physics-rules';
import {decideHouse,unpackPolicy} from '../shared/house-policy';

const names=['NOVA','PULSE','ONYX','VECTOR','DRIFT','ECHO','GLITCH','VIPER'],levels=[0,3,7,5,2,4,1,6];
const cases=512,rows:any[]=[];let randomState=0x901;
const random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState;};
const shots=Array.from({length:cases},(_,rally)=>({rally,seed:toHex(BigInt(random()),{size:32}),x:600+random()%300,y:6+random()%565,vx:-(200+random()%501),vy:((random()%801)-400)||1}));
for(const mode of [0,1])for(let style=0;style<8;style++){
 let returned=0,missed=0,unresolved=0;
 for(const shot of shots){
  let classic:State=responsiveState({...initial(shot.seed),x:BigInt(shot.x)*1000000n,y:BigInt(shot.y)*1000000n,vx:BigInt(shot.vx)*1000000n,vy:BigInt(shot.vy)*1000000n},17);
  let chaos:ChaosPhysicsState=responsiveState(initialChaosEvents(shot.seed),17);
  chaos.balls[0]={...chaos.balls[0],x:BigInt(shot.x)*1000000000000n,y:BigInt(shot.y)*1000000000000n,vx:classic.vx,vy:classic.vy};
  let brain=unpackPolicy(0n),done=false;
  for(let step=0;step<160;step++){
   const t=BigInt(step)*50000n;
   if(step%2===0){
    brain=decideHouse(style,{balls:mode?chaos.balls.filter(b=>b.alive):[{x:classic.x*1000000n,y:classic.y*1000000n,vx:classic.vx,vy:classic.vy}],side:0,t,
     paddle:mode?chaos.left:classic.left*1000000n,half:48000000000000n,opponent:288000000000000n,seed:shot.seed,rally:shot.rally,tournament:1n},brain,true);
   }
   if(mode){[chaos]=advanceChaosEvents({...chaos,leftDir:brain.held},t+50000n,256,true,'complete');}
   else [classic]=advance({...classic,leftDir:brain.held},t+50000n,128);
   if((mode?chaos.balls[0].vx:classic.vx)>0n){returned++;done=true;break;}
   if(mode?chaos.score.b>0:classic.scoreB>0){missed++;done=true;break;}
  }
  if(!done)unresolved++;
 }
 rows.push({mode:mode?'Chaos without drawn effect':'Classic',bot:names[style],level:levels[style],cases,returned,missed,unresolved,returnRate:returned/cases});
}
const report={scope:'Offline matched incoming shots at 300 units/s, revealed state only; not actual matches, browser or hosted proof',casesPerBotMode:cases,rows};
await writeFile('artifacts/command-integrity-20261007/house-calibration-1.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report));assert(rows.every(r=>r.unresolved===0),'Unresolved calibration trajectories');

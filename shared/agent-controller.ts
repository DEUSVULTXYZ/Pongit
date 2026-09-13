import {houseBots} from './agents';
import type {EngineState} from './engine-stream';
type Ball={x:number;y:number;vx:number;vy:number};
const reflect=(y:number)=>{const span=564,period=span*2;const offset=((y-6)%period+period)%period;return 6+(offset>span?period-offset:offset);};

/** Public-state controller. Randomness only affects this bot's aiming errors,
 * never contract physics, Chaos draws, results or the opponent's inputs. */
export class AgentController {
 private nextDecision=0;
 private direction:-1|0|1=0;
 private aimError=0;
 private lastRally=-1;
 constructor(private level:0|1|2,private random:()=>number=Math.random){}
 reset(){this.nextDecision=0;this.direction=0;this.lastRally=-1;}
 decide(snapshot:EngineState,side:0|1,monotonicMs:number):-1|0|1 {
  if(snapshot.phase!==2||snapshot.state.finished){this.direction=0;return 0;}
  if(monotonicMs<this.nextDecision)return this.direction;
  const settings=houseBots[this.level];this.nextDecision=monotonicMs+settings.reactionMs;
  const s=snapshot.state,rally=snapshot.chaos?.physics.score.rally??s.scoreA+s.scoreB;
  if(rally!==this.lastRally){this.lastRally=rally;this.aimError=(this.random()*2-1)*settings.error;}
  // Legacy coordinates are micro-units; packed Chaos uses pico-units and
  // velocities in units/second * 1e6. Only already revealed states are used.
  const balls:Ball[]=snapshot.chaos?snapshot.chaos.physics.balls.filter(b=>b.alive).map(b=>({x:Number(b.x)/1e12,y:Number(b.y)/1e12,vx:Number(b.vx)/1e6,vy:Number(b.vy)/1e6})):
   [{x:Number(s.x)/1e6,y:Number(s.y)/1e6,vx:Number(s.vx)/1e6,vy:Number(s.vy)/1e6}];
  const plane=side===0?40:984;let target=288,best=Infinity;
  for(const b of balls){
   if(!Number.isFinite(b.vx)||b.vx===0)continue;
   const arrival=(plane-b.x)/b.vx;
   if(arrival>=0&&arrival<best){best=arrival;target=reflect(b.y+b.vy*arrival);}
  }
  if(this.level===0&&best>0.8)target=target*.65+288*.35;
  const position=Number(side===0?s.left:s.right)/1e6;
  const half=Number(side===0?s.halfA:s.halfB)/1e6;
  target=Math.max(half,Math.min(576-half,target+this.aimError));
  const gap=target-position;this.direction=gap>settings.deadZone?1:gap< -settings.deadZone?-1:0;
  return this.direction;
 }
}

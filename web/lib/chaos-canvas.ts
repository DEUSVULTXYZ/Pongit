import {chaosEvent} from '../../shared/chaos-events';
import {chaosGeometry as G,chaosPortals} from '../../shared/chaos-geometry';
import {activeEffect,type EffectPair,type RuntimeEffect} from '../../shared/chaos-effects';

export type ChaosCanvasFrame={
 effects:EffectPair;gameMs:number;effectsEnabled:boolean;reducedMotion:boolean;
 paddles:readonly [{y:number;height:number;split:boolean},{y:number;height:number;split:boolean}];
 balls:readonly {id:number;x:number;y:number;vx:number;vy:number;power:boolean;curving:boolean}[];
 // An overlapping newly activated obstacle is intentionally shown as a ghost.
 ghostObstacles?:ReadonlySet<string>;
 impacts?:readonly {id:string;kind:string;x:number;y:number;at:number;color:string}[];
};
const line=(c:CanvasRenderingContext2D,x:number,y:number,xx:number,yy:number)=>{c.beginPath();c.moveTo(x,y);c.lineTo(xx,yy);c.stroke();};
function ring(c:CanvasRenderingContext2D,x:number,y:number,r:number){c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.stroke();}
function diamond(c:CanvasRenderingContext2D,x:number,y:number,r:number){c.beginPath();c.moveTo(x,y-r);c.lineTo(x+r,y);c.lineTo(x,y+r);c.lineTo(x-r,y);c.closePath();c.stroke();}
function pixels(c:CanvasRenderingContext2D,x:number,y:number,r:number,t:number){
 for(let i=0;i<8;i++){const a=i*Math.PI/4;const size=2+(i%2);c.fillRect(x+Math.cos(a)*r-size/2,y+Math.sin(a)*r-size/2+t*(i%3-1),size,size);}
}
function label(c:CanvasRenderingContext2D,text:string,x:number,y:number){c.font='bold 11px system-ui';c.textAlign='center';c.textBaseline='middle';c.fillText(text,x,y);}
const animated=(f:ChaosCanvasFrame)=>f.effectsEnabled&&!f.reducedMotion;

/** Called inside the existing court frame, before balls/paddles. No timers,
 * subscriptions, random draws, sound playback or competing animation loop. */
export function drawChaosCourt(c:CanvasRenderingContext2D,f:ChaosCanvasFrame){
 c.save();c.beginPath();c.rect(0,0,G.width,G.height);c.clip();
 for(const e of f.effects){
  if(!e.id||f.gameMs>=e.expiresAt)continue;
  const announcing=f.gameMs<e.startsAt,live=activeEffect(e,f.gameMs),color=chaosEvent(e.id).color;
  const age=f.gameMs-e.startsAt,phase=animated(f)?age/1000:0;
  c.save();c.strokeStyle=color;c.fillStyle=color;c.lineWidth=2;c.globalAlpha=announcing?.45:1;
  if(announcing)c.setLineDash([4,6]);
  if(f.ghostObstacles?.has(`${e.serial}:0`)){c.globalAlpha=.35;c.setLineDash([2,5]);}
  switch(e.id){
   case 3:{const x=e.target===0?10:1014;
    c.lineWidth=3;line(c,x,12,x,564);for(let y=24;y<560;y+=32){c.globalAlpha=.22;diamond(c,x,y,5);}break;}
   case 12:if(announcing&&animated(f)){c.globalAlpha=.4;c.beginPath();c.moveTo(40,f.paddles[0].y);c.bezierCurveTo(280,40,740,40,984,f.paddles[1].y);c.stroke();c.beginPath();c.moveTo(984,f.paddles[1].y);c.bezierCurveTo(740,536,280,536,40,f.paddles[0].y);c.stroke();}break;
   case 13:{const {x,y,radius}=G.bumper;ring(c,x,y,radius);c.globalAlpha*=.35;ring(c,x,y,radius-6);diamond(c,x,y,12);pixels(c,x,y,radius+6,0);break;}
   case 14:for(const [i,p] of chaosPortals(e.variant).entries()){
    ring(c,p.x,p.y,G.portalRadius);c.save();c.translate(p.x,p.y);c.rotate(phase*(i?-1:1));c.setLineDash([7,5]);ring(c,0,0,G.portalRadius-5);c.restore();
    label(c,i?'OUT / IN':'IN / OUT',p.x,p.y+36);
   }break;
   case 15:{c.globalAlpha*=.055;c.fillRect(G.warp.left,0,64,576);c.globalAlpha=announcing?.4:.65;line(c,480,10,480,566);line(c,544,10,544,566);
    for(let y=30;y<570;y+=48){const offset=animated(f)?(phase*24)%48:0;c.beginPath();c.moveTo(502,y+offset);c.lineTo(512,y-8+offset);c.lineTo(522,y+offset);c.stroke();}break;}
   case 16:{c.globalAlpha*=.26;for(const r of [48,96,160]){c.setLineDash(r===160?[3,8]:[]);ring(c,512,288,r);}c.setLineDash([]);c.globalAlpha=announcing?.4:.75;diamond(c,512,288,10);
    if(animated(f))for(let i=0;i<6;i++){const a=i*Math.PI/3+phase*.18;line(c,512+Math.cos(a)*152,288+Math.sin(a)*152,512+Math.cos(a-.1)*140,288+Math.sin(a-.1)*140);}break;}
   case 17:{const sign=(e.variant&1)?1:-1;c.globalAlpha*=.22;
    for(let i=0;i<12;i++){const x=100+i*75,y=40+((i*91+(animated(f)?phase*32*sign:0))%490+490)%490;
     line(c,x,y,x,y+14*sign);line(c,x,y+14*sign,x-3,y+10*sign);line(c,x,y+14*sign,x+3,y+10*sign);}break;}
   case 18:{c.save();c.translate(G.deflector.x,G.deflector.y);c.rotate((e.variant&1)?Math.PI/4:-Math.PI/4);
    c.lineWidth=8;c.lineCap='round';line(c,-44,0,44,0);c.strokeStyle=live?'#223445':color;c.lineWidth=4;line(c,-44,0,44,0);c.restore();break;}
   case 19:for(let i=0;i<3;i++)if(e.remaining&(1<<i)){
    const p=G.bricks[i];c.save();if(f.ghostObstacles?.has(`${e.serial}:${i}`)){c.globalAlpha=.3;c.setLineDash([2,4]);}
    c.strokeRect(p.x-28,p.y-8,56,16);c.globalAlpha*=.2;c.fillRect(p.x-26,p.y-6,52,12);c.globalAlpha=announcing?.3:.7;line(c,p.x,p.y-7,p.x,p.y+7);c.restore();
   }break;
   case 20:c.setLineDash([16,10]);line(c,48,6,976,6);line(c,48,570,976,570);break;
   case 22:c.globalAlpha=announcing?.55:1;label(c,'×2 POINT',512,24);diamond(c,459,24,4);diamond(c,565,24,4);break;
   case 23:{c.lineWidth=3;c.strokeStyle='#db516d';for(const x of [4,1020]){line(c,x,30,x,100);line(c,x,476,x,546);}c.strokeStyle='#ffcf72';line(c,20,4,160,4);line(c,864,4,1004,4);label(c,'BOSS ROUND',512,552);break;}
   case 24:{const p=G.pickup;c.save();c.translate(p.x,p.y);c.fillStyle='#160c29';c.beginPath();c.arc(0,0,p.radius,0,Math.PI*2);c.fill();c.stroke();c.fillStyle=color;label(c,'?',0,1);pixels(c,0,0,23,animated(f)?Math.sin(phase*2)*2:0);c.restore();break;}
  }
  c.restore();
 }
 c.restore();
}

/** Paint the actual solid segments first, then optional cosmetic overlays. */
export function drawChaosPaddles(c:CanvasRenderingContext2D,f:ChaosCanvasFrame){
 c.save();
 for(let side=0;side<2;side++){
  const p=f.paddles[side],x=side===0?G.leftX:G.rightX,color=side===0?'#7ceeff':'#d6a0ff';
  c.fillStyle=color;
  if(p.split){c.fillRect(x,p.y-8-p.height/2,12,p.height/2);c.fillRect(x,p.y+8,12,p.height/2);c.save();c.strokeStyle=color;c.globalAlpha=.25;line(c,x+6,p.y-8,x+6,p.y+8);c.restore();}
  else c.fillRect(x,p.y-p.height/2,12,p.height);
  for(const e of f.effects){
   if(!activeEffect(e,f.gameMs)||(e.target!==side&&e.id!==23))continue;
   const age=f.gameMs-e.startsAt,outer=p.height/2+(p.split?8:0),col=chaosEvent(e.id).color;
   c.save();c.fillStyle=col;c.strokeStyle=col;c.lineWidth=1.5;
   switch(e.id){
    case 1:case 23:for(const sign of [-1,1]){line(c,x-3,p.y+sign*(outer+4),x+15,p.y+sign*(outer+4));if(animated(f)&&age<400){c.globalAlpha=1-age/400;line(c,x-6,p.y+sign*(outer+4+age*.04),x+18,p.y+sign*(outer+4+age*.04));}}break;
    case 2:if(animated(f)){c.globalAlpha=.55;c.beginPath();c.moveTo(x+(side?-8:20),p.y-outer);for(let k=1;k<=8;k++)c.lineTo(x+(side?-8:20)+(k%2?3:-3),p.y-outer+2*outer*k/8);c.stroke();}label(c,'»',x+(side?-24:36),p.y);break;
    case 4:diamond(c,x+6,p.y,5);break;
    case 5:c.beginPath();c.moveTo(x+1,p.y+9);c.quadraticCurveTo(x+11,p.y,x+1,p.y-9);c.stroke();break;
    case 6:c.fillStyle='#ffdd72';if(!p.split)c.fillRect(x,p.y-p.height/8,12,p.height/4);else{const marked=Math.max(0,p.height/8-8);c.fillRect(x,p.y-8-marked,12,marked);c.fillRect(x,p.y+8,12,marked);}break;
    case 7:if(animated(f)&&age<400){c.globalAlpha=1-age/400;pixels(c,x+6,p.y,outer+age*.03,0);}line(c,x-2,p.y-outer-3,x+14,p.y-outer-3);line(c,x-2,p.y+outer+3,x+14,p.y+outer+3);break;
    case 8:case 10:if(e.id===8||age>=4000){c.globalAlpha=.5;for(let y=p.y-outer+8;y<p.y+outer;y+=16)line(c,x+1,y-4,x+11,y+4);label(c,'▼',x+(side?-16:28),p.y);}else{c.fillStyle='#ff845d';diamond(c,x+(side?-16:28),p.y,8);label(c,String(Math.max(1,Math.ceil((4000-age)/1000))),x+(side?-16:28),p.y);}break;
    case 9:c.globalAlpha=.7;for(let y=p.y-outer+8;y<p.y+outer-5;y+=12)diamond(c,x+6,y,5);break;
    case 11:line(c,x-3,p.y-8,x-3,p.y+8);line(c,x+15,p.y-8,x+15,p.y+8);break;
   }
   c.restore();
  }
 }
 c.restore();
}

/** Ball accents stay behind the opaque white body. Trails are owned separately
 * by stable ball ID and reset by the transport on service/teleport. */
export function drawChaosBalls(c:CanvasRenderingContext2D,f:ChaosCanvasFrame){
 c.save();
 for(const b of f.balls){
  if(animated(f)&&(b.power||b.curving)){
   const angle=Math.atan2(b.vy,b.vx);c.save();c.translate(b.x,b.y);c.rotate(angle);c.fillStyle=b.power?'#ff9346':'#b891ff';c.globalAlpha=.65;
   c.beginPath();c.moveTo(-5,-4);c.lineTo(-19,-2);c.lineTo(-14,0);c.lineTo(-24,2);c.lineTo(-5,4);c.closePath();c.fill();c.restore();
  }
  c.fillStyle=b.id===1?'#fff':'#e7deff';c.beginPath();c.arc(b.x,b.y,G.ballRadius,0,Math.PI*2);c.fill();c.strokeStyle=b.id===1?'#c2ffff':'#d1a4ff';c.lineWidth=1;ring(c,b.x,b.y,G.ballRadius-.5);
 }
 if(animated(f))for(const hit of f.impacts||[]){const age=f.gameMs-hit.at;if(age<0||age>260)continue;c.save();c.fillStyle=hit.color;c.strokeStyle=hit.color;c.globalAlpha=(1-age/260)*.75;pixels(c,hit.x,hit.y,5+age*.08,0);if(hit.kind==='shield'||hit.kind==='brick')diamond(c,hit.x,hit.y,8+age*.05);c.restore();}
 c.restore();
}

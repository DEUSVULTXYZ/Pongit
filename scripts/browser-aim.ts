/** Browser recipe reads drawn geometry only, never changes game state. */
export function visibleAim(previous:any,current:any,side:0|1,half:number,edge:boolean){
 const paddle=current?.paddles?.[side];if(!Number.isFinite(paddle))return {direction:0 as const,nearContact:false};
 const elapsed=(current.at-previous?.at)/1000;
 const incoming=(current.balls??[]).map((ball:any)=>{
  const old=previous?.balls?.find((b:any)=>b.id===ball.id);
  if(!old||current.rally!==previous.rally||elapsed<=0||elapsed>.1)return;
  const vx=(ball.x-old.x)/elapsed,vy=(ball.y-old.y)/elapsed,plane=side===0?40:984;
  const seconds=(plane-ball.x)/vx;
  if(!Number.isFinite(seconds)||seconds<0||seconds>3||Math.abs(vx)<1)return;
  const travel=ball.y+vy*seconds-6,fold=((travel%1128)+1128)%1128;
  return{seconds,y:6+(fold<=564?fold:1128-fold)};
 }).filter(Boolean).sort((a:any,b:any)=>a.seconds-b.seconds)[0];
 const target=incoming?incoming.y+(edge?Math.max(0,half-12)*(side===0?1:-1):0):288;
 const nearContact=!!incoming&&incoming.seconds<=.12;
 const direction=nearContact||Math.abs(target-paddle)<7?0:target<paddle?-1:1;
 return{direction:direction as -1|0|1,nearContact,target,contactIn:incoming?.seconds};
}

/** Schedule a real held input then release 30 ms before the visually estimated
 * contact. Sampling only the final 120 ms window can miss it between CDP calls.
 * This changes only the test player's physical input, never a game snapshot. */
export function visibleContactRelease(aim:{contactIn?:number;direction:number;target?:number},paddle:number){
 const seconds=aim.contactIn;
 if(!Number.isFinite(seconds)||seconds!<.05||seconds!>.35||!Number.isFinite(paddle))return null;
 const direction=aim.direction||((aim.target??288)<paddle?-1:1);
 return{direction:direction as -1|1,holdMs:Math.max(10,Math.round((seconds!-.03)*1000)),contactIn:seconds!};
}

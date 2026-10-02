import {encodeAbiParameters,keccak256,type Hex} from 'viem';
const U=1_000_000_000_000n;
export type PolicyBall={x:bigint;y:bigint;vx:bigint;vy:bigint};
export type PolicyView={balls:PolicyBall[];side:0|1;t:bigint;paddle:bigint;half:bigint;opponent:bigint;seed:Hex;rally:number;tournament:bigint};
export type PolicyMemory={nextDecision:bigint;held:-1|0|1;meanVy:bigint;samples:number;lastTarget:bigint};
const abs=(n:bigint)=>n<0n?-n:n;
export function reflectPolicy(y:bigint){const span=564n*U,period=span*2n,offset=((y-6n*U)%period+period)%period;return 6n*U+(offset>span?period-offset:offset);}
export function unpackPolicy(word:bigint):PolicyMemory{
 return word===0n?{nextDecision:0n,held:0,meanVy:0n,samples:0,lastTarget:0n}:{
  nextDecision:word&((1n<<40n)-1n),held:(Number(word>>40n&3n)-1) as -1|0|1,
  meanVy:BigInt.asIntN(48,word>>42n),samples:Number(word>>90n&65535n),lastTarget:word>>106n&((1n<<56n)-1n)};
}
export function packPolicy(m:PolicyMemory){return m.nextDecision|(BigInt(m.held+1)<<40n)|(BigInt.asUintN(48,m.meanVy)<<42n)|(BigInt(m.samples)<<90n)|(m.lastTarget<<106n);}
const tuning=[[280000,58,17],[160000,25,10],[85000,8,6],[120000,12,7],[110000,20,9],[140000,15,8],[130000,42,8],[105000,10,5]];
const levels=[0,3,7,5,2,4,1,6];
/** Exact integer mirror of immutable HousePolicies / ProgressiveHousePolicies.
 * It consumes only the revealed state and public memory. No beacon is chosen. */
export function decideHouse(style:number,v:PolicyView,prior:PolicyMemory,progressive:boolean):PolicyMemory{
 if(!Number.isInteger(style)||style<0||style>=8||v.half<=0n||v.half>120n*U||v.balls.length>2)throw Error('policy view');
 const level=levels[style],tune=progressive?[450000-50000*level,18-2*level,14-level]:tuning[style];
 const reaction=BigInt(tune[0]),error=BigInt(tune[1])*U,dead=BigInt(tune[2])*U;
 const brain={...prior};if(v.t<brain.nextDecision)return brain;
 brain.nextDecision=(v.t/reaction+1n)*reaction;
 let target=288n*U,incoming=false,arrival=0n,chosen=0,best=(1n<<256n)-1n;
 const plane=(v.side===0?40n:984n)*U;
 for(let i=0;i<v.balls.length;i++){
  const ball=v.balls[i],d=plane-ball.x;if(ball.vx===0n||d!==0n&&(d<0n)!==(ball.vx<0n))continue;
  const eta=abs(d)/abs(ball.vx);if(abs(ball.vy)!==0n&&eta>((1n<<128n)-1n)/abs(ball.vy))continue;
  if(eta>=best)continue;chosen=i;best=eta;arrival=eta;incoming=true;target=reflectPolicy(ball.y+ball.vy*eta);
 }
 if(progressive){
  if(incoming){const ball=v.balls[chosen],horizon=250000n+150000n*BigInt(level);
   if(arrival>horizon)target=reflectPolicy(ball.y+ball.vy*horizon);
   if(style===5){brain.meanVy=brain.samples===0?ball.vy:(3n*brain.meanVy+ball.vy)/4n;brain.samples=Math.min(65535,brain.samples+1);
    let lead=(brain.meanVy-ball.vy)*(arrival<horizon?arrival:horizon)/8n;
    if(lead>6n*U)lead=6n*U;if(lead< -6n*U)lead=-6n*U;target+=lead;}
  }else if(style===4){let sweep=v.t/10000n%120n;if(sweep>60n)sweep=120n-sweep;target=258n*U+sweep*U;}
  const draw=BigInt(keccak256(encodeAbiParameters([{type:'bytes32'},{type:'uint32'},{type:'uint8'},{type:'uint64'}],[v.seed,v.rally,v.side,v.tournament])));
  if(incoming&&draw%100n<BigInt(55-7*level))target+=target<288n*U?110n*U:-110n*U;
  else if(style===7&&incoming)target+=v.opponent<288n*U?12n*U:-12n*U;
  const noise=style===6?BigInt(keccak256(encodeAbiParameters([{type:'uint256'},{type:'uint64'}],[draw,v.t/reaction]))):draw>>16n;
  target+=noise%(2n*error+1n)-error;
 }else{
  if(style===0&&incoming&&arrival>800000n)target=(target*65n+288n*U*35n)/100n;
  if(style===4&&!incoming){let sweep=v.t/10000n%240n;if(sweep>120n)sweep=240n-sweep;target=228n*U+sweep*U;}
  if(style===5&&v.balls.length){const ball=v.balls[chosen];brain.meanVy=brain.samples===0?ball.vy:(3n*brain.meanVy+ball.vy)/4n;brain.samples=Math.min(65535,brain.samples+1);
   if(incoming&&arrival<1000000n)target=reflectPolicy(ball.y+(brain.meanVy+3n*ball.vy)/4n*arrival);}
  if(style===3&&incoming&&arrival>600000n)target=reflectPolicy(target);
  if(style===7&&incoming)target+=v.opponent<288n*U?v.half*3n/5n:-v.half*3n/5n;
  const draw=BigInt(keccak256(encodeAbiParameters([{type:'bytes32'},{type:'uint32'},{type:'uint8'},{type:'uint64'},{type:'uint8'},{type:'uint64'}],
   [v.seed,v.rally,v.side,v.tournament,style,style===6?v.t/reaction:0n])));
  target+=draw%(2n*error+1n)-error;
 }
 target=target<v.half?v.half:target>576n*U-v.half?576n*U-v.half:target;
 brain.lastTarget=target;const gap=target-v.paddle;brain.held=gap>dead?1:gap< -dead?-1:0;return brain;
}

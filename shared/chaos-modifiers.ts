export type ModifierEffect={id:number;target:number;startsAt:bigint;expiresAt:bigint;consumed:boolean};
export function modifierActive(e:ModifierEffect,nowMs:bigint){return e.id!==0&&!e.consumed&&nowMs>=e.startsAt&&nowMs<e.expiresAt;}
export function chaosPaddles(bettingA:bigint,bettingB:bigint,effects:readonly [ModifierEffect,ModifierEffect],nowMs:bigint){
 const S=1000000n;
 if(bettingA<72n*S||bettingA>96n*S||bettingB<72n*S||bettingB>96n*S)throw Error('Invalid effect state');
 const sizes=[bettingA,bettingB],hn=[1n,1n],hd=[1n,1n],vn=[1n,1n],vd=[1n,1n],split=[false,false];
 for(const e of effects){
  if(!Number.isInteger(e.id)||e.id<0||e.id>24||!Number.isInteger(e.target)||e.target<0||e.target>2||e.id!==0&&e.expiresAt<=e.startsAt)throw Error('Invalid effect state');
  if(modifierActive(e,nowMs)&&e.id===12)[sizes[0],sizes[1]]=[sizes[1],sizes[0]];
 }
 for(const e of effects){if(!modifierActive(e,nowMs))continue;
  for(let side=0;side<2;side++){
   if(e.target!==side&&e.id!==23)continue;
   if(e.id===1||e.id===23){hn[side]*=5n;hd[side]*=4n;}
   if(e.id===7||e.id===9){hn[side]*=4n;hd[side]*=5n;}
   if(e.id===2){vn[side]*=13n;vd[side]*=10n;}
   if(e.id===8||e.id===10&&nowMs>=e.startsAt+4000n){vn[side]*=4n;vd[side]*=5n;}
   if(e.id===11)split[side]=true;
  }
 }
 const bound=(n:bigint)=>n<64n*S?64n*S:n>120n*S?120n*S:n;
 return {heightA:bound(sizes[0]*hn[0]/hd[0]),heightB:bound(sizes[1]*hn[1]/hd[1]),speedA:180n*S*vn[0]/vd[0],speedB:180n*S*vn[1]/vd[1],splitA:split[0],splitB:split[1]};
}
export function chaosOuterHalf(solidHeight:bigint,split:boolean){return (solidHeight+(split?16000000n:0n))/2n;}

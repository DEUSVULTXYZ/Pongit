import {encodeAbiParameters,type Abi,type Hex} from 'viem';
import {chaosEvent} from '../shared/chaos-events';
/** Hand-authored fixed state for UI tests, not the production physics encoder. */
export function chaosBrowserPayload(abi:Abi,header:any[],id:number,other=0):Hex{
 const s=header[12],P=1000000n,t=BigInt(s.t),u=(v:bigint,n:number)=>BigInt.asUintN(n,v);
 const ball=(second=false)=>[u(s.x*P,56)|(u(s.y*P,56)<<56n)|(1n<<112n)|(1n<<128n)|(2n<<168n)|(1n<<195n),u(s.vx,80)|(u(second?-s.vy:s.vy,80)<<80n)];
 const effect=(n:number)=>n?BigInt(n)|(BigInt(n>=12?2:0)<<8n)|(BigInt(n===19?7:[3,4,5].includes(n)?1:0)<<16n)|(BigInt(n)<<24n)|(1000n<<56n)|(BigInt(1000+chaosEvent(n).durationMs)<<88n):0n;
 const both=id===21||other===21;
 const words=[...ball(),...(both?ball(true):[0n,0n]),effect(id),effect(other),s.left*P|(s.right*P<<56n)|(t<<112n)|((t+10000n)<<176n),
 BigInt(s.scoreA)|(BigInt(s.scoreB)<<3n)|(1n<<6n)|(s.finished?1n<<38n:0n)|(1n<<41n)|(1n<<43n)|(BigInt((id?1<<(id-1):0)|(other?1<<(other-1):0))<<45n)|(96000000n<<101n)|(96000000n<<133n)];
 const getter=abi.find(x=>x.type==='function'&&x.name==='getSnapshot') as any;
 return encodeAbiParameters([{type:'tuple',components:getter.outputs.map((o:any,i:number)=>({...o,name:`f${i}`}))},{type:'uint256[8]'},{type:'uint256'},{type:'uint256'}],[header,words as [bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint],0n,0n]);
}

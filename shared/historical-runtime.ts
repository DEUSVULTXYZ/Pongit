import {keccak256,type Address,type Hex} from 'viem';

type Range={start:number;length:number};
export type HistoricalArtifact={deployedBytecode:{object:string;immutableReferences?:Record<string,Range[]>;linkReferences?:Record<string,Record<string,Range[]>>}};
/** Compare a historical build to a pinned chain block, including every linked
 * library. Masking an unresolved link without checking its target is insufficient. */
export async function verifyHistoricalRuntime(address:Address,artifact:HistoricalArtifact,readCode:(address:Address)=>Promise<Hex|undefined>,readArtifact:(source:string,name:string)=>Promise<HistoricalArtifact>){
 const verified=new Map<string,Hex>(),visiting=new Set<string>();
 async function visit(at:Address,a:HistoricalArtifact,depth:number){
  if(depth>8||visiting.has(at.toLowerCase()))throw Error('Unexpected historical library graph');
  const code=await readCode(at);if(!code||code==='0x')throw Error('Historical runtime is missing');
  const expected=a.deployedBytecode.object;
  if(code.length!==expected.length)throw Error('Historical runtime length differs');
  const mask:Range[]=Object.values(a.deployedBytecode.immutableReferences??{}).flat();
  visiting.add(at.toLowerCase());
  for(const [source,libraries] of Object.entries(a.deployedBytecode.linkReferences??{}))for(const [name,refs] of Object.entries(libraries)){
   if(!refs.length)throw Error('Historical library has no locations');
   let target:Address|undefined;
   for(const ref of refs){
    if(ref.length!==20||ref.start<0||ref.start+ref.length>(code.length-2)/2)throw Error('Invalid historical library location');
    const value=`0x${code.slice(2+ref.start*2,2+(ref.start+ref.length)*2)}` as Address;
    if(target&&target.toLowerCase()!==value.toLowerCase())throw Error('Historical library targets disagree');
    target=value;mask.push(ref);
   }
   await visit(target!,await readArtifact(source,name),depth+1);
  }
  const normalize=(text:string)=>{
   const metadata=Number.parseInt(text.slice(-4),16);
   if(!metadata||metadata>=500||text.length<=(metadata+2)*2)throw Error('Missing historical Solidity metadata');
   for(const range of mask){
    if(!Number.isSafeInteger(range.start)||!Number.isSafeInteger(range.length)||range.start<0||range.length<=0||range.start+range.length>(text.length-2)/2-metadata-2)throw Error('Invalid historical runtime location');
    text=text.slice(0,2+range.start*2)+'0'.repeat(range.length*2)+text.slice(2+(range.start+range.length)*2);
   }
   return text.slice(0,-(metadata+2)*2).toLowerCase();
  };
  if(normalize(code)!==normalize(expected))throw Error('Source runtime differs from the audited storage layout');
  verified.set(at.toLowerCase(),keccak256(code));visiting.delete(at.toLowerCase());return code;
 }
 const code=await visit(address,artifact,0);return{code,verified:Object.fromEntries(verified)};
}

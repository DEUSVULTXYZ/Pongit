import {encodeAbiParameters,encodeEventTopics,keccak256,zeroHash,type Abi,type Address,type Hex} from 'viem';
import {reusableAgentArenaAbi} from '../../shared/abi-ReusableAgentArena';
import {abi as humanAbi} from '../../shared/abi-independent-ReusableEventsArena';
import {publishedResultLeaf} from '../../shared/published-result-tree';
export function resultFixture(rules:14|15=15,app:Address='0x1111111111111111111111111111111111111111',id=91n,epoch=2n){
 const abi=rules===14?humanAbi:reusableAgentArenaAbi,a='0x2222222222222222222222222222222222222222',b='0x3333333333333333333333333333333333333333';
 const ref={chainId:10143n,arena:app,epoch},ticketHash=keccak256('0x1234');
 const common={a,b,winner:a,mode:1,status:3,scoreA:7,scoreB:6,hash:keccak256('0xabcd')};
 const match_=rules===14?{...common,arena:app,epoch,id,ranked:false}:{...common,ref:{...ref,id},elapsedUs:200000n,finality:false};
 const result={match_,rules:BigInt(rules),elapsedUs:200000n,finishedAt:1000n,brainA:0n,brainB:0n};
 const output=abi.find(x=>x.type==='function'&&x.name==='publishedResult') as any;
 const canonical=encodeAbiParameters(output.outputs,[result]),resultHash=keccak256(canonical),leaf=publishedResultLeaf(ref,id,ticketHash,resultHash);
 let root=leaf,empty:Hex=zeroHash;for(let i=0;i<16;i++){root=keccak256(encodeAbiParameters([{type:'bytes32'},{type:'bytes32'}],[root,empty]));empty=keccak256(encodeAbiParameters([{type:'bytes32'},{type:'bytes32'}],[empty,empty]));}
 const commit={epoch,matchId:id,index:0,ticketHash,resultHash,leaf,root};
 function log(name:string,args:any){const e=abi.find(x=>x.type==='event'&&x.name===name) as any;return{address:app,topics:encodeEventTopics({abi:abi as Abi,eventName:name,args} as any) as Hex[],data:encodeAbiParameters(e.inputs.filter((x:any)=>!x.indexed),e.inputs.filter((x:any)=>!x.indexed).map((x:any)=>args[x.name]))};}
 const logs=[log('ResultCommitted',commit),log('Completed',{epoch,id,result})];
 return{abi,ref,ticketHash,result,canonical,resultHash,leaf,root,commit,logs,log,frame:{app,head:10n,hash:keccak256('0x99'),logs}};
}

import {encodeAbiParameters,keccak256,type Address,type Hex} from 'viem';
export const livePressureTypes={LivePressure:[
 {name:'matchId',type:'uint256'},{name:'epoch',type:'uint256'},{name:'seed',type:'bytes32'},
 {name:'rally',type:'uint8'},{name:'paidA',type:'uint128'},{name:'paidB',type:'uint128'},
 {name:'sourceBlock',type:'uint64'},{name:'checkpoint',type:'bytes32'},{name:'expires',type:'uint64'},
]} as const;
export const livePressureDomain=(app:Address)=>({name:'PONGIT Realtime Pressure',version:'1',chainId:10143,verifyingContract:app});
// Rules 6 uses a real rally counter, including void and double-point rallies.
// Keep the original domain/types intact for all historical markets.
export const eventsPressureTypes={LivePressure:livePressureTypes.LivePressure.map(p=>p.name==='rally'?{name:'rally',type:'uint32'} as const:p)} as const;
export const eventsPressureDomain=(app:Address)=>({...livePressureDomain(app),version:'2'});
export function livePressureCheckpoint(app:Address,market:Address,id:bigint,epoch:bigint,seed:Hex,block:bigint,hash:Hex,a:bigint,b:bigint){
 return keccak256(encodeAbiParameters([{type:'uint256'},{type:'address'},{type:'address'},{type:'uint256'},{type:'uint256'},{type:'bytes32'},{type:'uint64'},{type:'bytes32'},{type:'uint128'},{type:'uint128'}],
 [10143n,app,market,id,epoch,seed,block,hash,a,b]));
}

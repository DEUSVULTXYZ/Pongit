import {parseAbi,type Abi,type Address} from 'viem';

/** Optional authority capability. Legacy pools keep exclusive identities. */
export const houseInstanceAbi=parseAbi([
 'function supportsHouseInstances() view returns (bool)',
 'function AUTHORITY_VERSION() view returns (uint256)',
 'function houseInstanceEligible(address agent,uint8 mode) view returns (bool)',
 'function opponentEligible(address agent,uint8 mode) view returns (bool)',
]);
export const agentPoolAdmissionAbi=parseAbi([
 'function laneCount() view returns (uint8)',
 'function admissionOperator() view returns (address)',
 'function maintenanceOperator() view returns (address)',
 'function arenaAdmissionEnabled(address app,uint256 epoch) view returns (bool)',
 'function setArenaAdmission(address app,uint256 epoch,bool enabled,bytes32 reason)',
 'function setArenaAdmissions(address[] apps,uint256[] epochs,bool[] enabled,bytes32 reason)',
 'function arenaAvailable(address arena) view returns (bool)',
]);
type Read=<T=any>(address:Address,abi:Abi,fn:string,args?:readonly unknown[])=>Promise<T>;
export async function verifyHouseInstanceAuthorities(read:Read,m:{pool:Address;challenges:Address;qualifications:Address;houseInstances?:'official-v1';maxMatches?:2|5}){
 if(!m.houseInstances)return;
 const [version,lanes,...supported]=await Promise.all([
  read<bigint>(m.pool,houseInstanceAbi,'AUTHORITY_VERSION'),
  m.maxMatches===5?read<number>(m.pool,agentPoolAdmissionAbi,'laneCount'):Promise.resolve(2),
  ...[m.pool,m.challenges,m.qualifications].map(at=>read<boolean>(at,houseInstanceAbi,'supportsHouseInstances')),
 ]);
 if(version!==(m.maxMatches===5?3n:2n)||supported.some(value=>value!==true))throw Error('House instance authority mismatch');
 if(m.maxMatches===5&&lanes!==5)throw Error('Agent lane count mismatch');
}

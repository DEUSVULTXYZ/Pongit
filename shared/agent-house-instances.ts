import {parseAbi,type Abi,type Address} from 'viem';

/** Optional authority capability. Legacy pools keep exclusive identities. */
export const houseInstanceAbi=parseAbi([
 'function supportsHouseInstances() view returns (bool)',
 'function AUTHORITY_VERSION() view returns (uint256)',
 'function houseInstanceEligible(address agent,uint8 mode) view returns (bool)',
 'function opponentEligible(address agent,uint8 mode) view returns (bool)',
]);
type Read=<T=any>(address:Address,abi:Abi,fn:string,args?:readonly unknown[])=>Promise<T>;
export async function verifyHouseInstanceAuthorities(read:Read,m:{pool:Address;challenges:Address;qualifications:Address;houseInstances?:'official-v1'}){
 if(!m.houseInstances)return;
 const [version,...supported]=await Promise.all([
  read<bigint>(m.pool,houseInstanceAbi,'AUTHORITY_VERSION'),
  ...[m.pool,m.challenges,m.qualifications].map(at=>read<boolean>(at,houseInstanceAbi,'supportsHouseInstances')),
 ]);
 if(version!==2n||supported.some(value=>value!==true))throw Error('House instance authority mismatch');
}

import {isAddress,zeroAddress,type Hex,type Address} from 'viem';

/** A requested controller version can already be installed. Only changed code
 * needs the rebalanced registry, which deliberately clears house qualifications.
 * Comparing addresses would incorrectly reset identical immutable policies. */
export function agentCatalogMigration(predecessor:Hex,requested:Hex=predecessor){
 for(const hash of [predecessor,requested])
  if(!/^0x[\da-f]{64}$/i.test(hash)||BigInt(hash)===0n)throw Error('Verified house policy hashes required');
 const changed=predecessor.toLowerCase()!==requested.toLowerCase();
 return {artifact:changed?'RebalancedAgentCatalog' as const:'MigratingAgentCatalog' as const,changed,
  predecessorPolicyHash:predecessor.toLowerCase(),targetPolicyHash:requested.toLowerCase()};
}

/** Reusing verified immutable code still requires its versioned runtime alias.
 * Omitting it made a successful same-policy import fail every worker startup. */
export function migratedHousePolicyModules(policy:Address,progressive:boolean){
 if(!isAddress(policy)||policy.toLowerCase()===zeroAddress)throw Error('Verified house policy address required');
 return {HousePolicies:policy,...(progressive?{ProgressiveHousePolicies:policy}:{})};
}

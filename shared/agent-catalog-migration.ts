import type {Hex} from 'viem';

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

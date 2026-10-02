export type AgentIndexDeployment = {
  chainId: number; rulesVersion: 11 | 15 | 16; pool: string; startBlock: string; arenas: string[];
  archiveContract?: 'AgentReusableFiveArchive';
};

/** Legacy single-pool files remain valid. A migration must list each retired
 * emitter alongside the new one, so later corrections keep their old routes. */
export function agentIndexDeployments(raw: unknown, chainId: number, rulesVersion: 11 | 15 | 16): AgentIndexDeployment[] {
  const value = raw as any;
  const items = value?.version === 2 ? value.deployments : [value];
  if (!value || value.chainId !== chainId || (value.version !== undefined && value.version !== 2)
    || !Array.isArray(items) || items.length < 1 || items.length > 9)
    throw Error('Invalid agent archive manifest');
  const address = (a: unknown): a is string => typeof a === 'string' && /^0x[\da-f]{40}$/i.test(a) && BigInt(a) !== 0n;
  const pools = new Set<string>(), arenas = new Set<string>();
  const result = items.map((item: any): AgentIndexDeployment => {
    // The reusable archive schema is shared, but each historical emitter keeps
    // its immutable rules. A rules-16 reader must not relabel old results.
    if (!item || item.chainId !== chainId || !(rulesVersion >= 15 ? [15,16].includes(item.rulesVersion) : item.rulesVersion === rulesVersion) || !address(item.pool)
      || !/^(0|[1-9]\d*)$/.test(String(item.startBlock))
      || !Array.isArray(item.arenas) || item.arenas.length < (rulesVersion >= 15 ? 3 : 2)
      || item.arenas.length > (rulesVersion >= 15 ? 32 : 16) || !item.arenas.every(address))
      throw Error('Invalid series archive manifest');
    if(item.archiveContract !== undefined && (item.archiveContract !== 'AgentReusableFiveArchive' || rulesVersion < 15))
      throw Error('Invalid series archive contract alias');
    const pool = item.pool.toLowerCase();
    if (pools.has(pool)) throw Error('Duplicate series archive emitter');
    pools.add(pool);
    const apps: string[] = item.arenas.map((a: string) => a.toLowerCase());
    for (const app of apps) {
      if (arenas.has(app)) throw Error('Ambiguous historical arena');
      arenas.add(app);
    }
    return {chainId, rulesVersion:item.rulesVersion, pool, startBlock: String(item.startBlock), arenas: apps,
      ...(item.archiveContract ? {archiveContract:item.archiveContract} : {})};
  });
  if ([...pools].some(pool => arenas.has(pool))) throw Error('Archive emitter cannot be an arena');
  return result;
}

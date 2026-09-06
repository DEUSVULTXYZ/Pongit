import type { ClientBase } from "pg";

// Keep the maximum reservation until a receipt is persisted. A reverted
// transaction pays gas, but transfers none of its requested native value.
const accountedCost = `CASE WHEN status IN ('succeeded','failed') AND receipt IS NOT NULL
  THEN coalesce((receipt->>'gasUsed')::numeric * (receipt->>'effectiveGasPrice')::numeric
    + CASE WHEN receipt->>'status'='success' THEN coalesce((payload->>'value')::numeric,0) ELSE 0 END, cost)
  ELSE cost END`;

export async function readSponsorCosts(db: Pick<ClientBase, "query">, balanceObservedAt: Date) {
  const result = await db.query(`SELECT
    coalesce(sum(${accountedCost}) FILTER (WHERE status IN ('signed','sent') OR
      (status IN ('succeeded','failed') AND coalesce(confirmed_at,updated_at) >= date_trunc('day',now()))),0) AS spent,
    coalesce(sum(${accountedCost}) FILTER (WHERE raw_tx IS NOT NULL AND
      (status IN ('signed','sent') OR updated_at >= $1)),0) AS commitments
    FROM relay_jobs`, [balanceObservedAt]);
  return { spent: BigInt(result.rows[0].spent), commitments: BigInt(result.rows[0].commitments) };
}

// A funded sender that stays above Monad's 10 MON reserve need not wait for
// a quiet block window. Reserve the chain's entire 30M gas allowance before
// estimation, plus all commitments since the cached balance observation.
export function needsMonadValueWindow(chainId:number,value:bigint,balance:bigint,commitments:bigint,gasPriceCap:bigint) {
  return chainId===10143 && value>0n && balance < 10n**19n + value + commitments + 30_000_000n*gasPriceCap;
}

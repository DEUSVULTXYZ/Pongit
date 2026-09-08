import type { Pool, PoolClient } from "pg";
import type { Address } from "viem";

// Offers supply identities when result indexing has not caught up. They never
// supply an ELO: callers must read the live or published contract rating.
export async function roomsRankingCandidates(
  db: Pool | PoolClient,
  apps: string[],
  mode: number,
): Promise<Address[]> {
  const { rows } = await db.query(
    `WITH ranked_offers AS (
      SELECT offer FROM il_offers WHERE app=ANY($1::text[])
      UNION ALL
      SELECT room.value->'offer' AS offer
      FROM il_lobby lobby
      CROSS JOIN LATERAL jsonb_each(lobby.document->'rooms') room
      WHERE lobby.app=ANY($1::text[])
    ), candidates AS (
      SELECT a AS player FROM il_results
      WHERE app=ANY($1::text[]) AND verified AND ranked AND mode=$2
      UNION SELECT b FROM il_results
      WHERE app=ANY($1::text[]) AND verified AND ranked AND mode=$2
      UNION SELECT player FROM ranked_offers
      CROSS JOIN LATERAL (VALUES (offer->>'a'),(offer->>'b')) participant(player)
      WHERE offer->>'ranked'='true'
        AND COALESCE(offer->>'mode','0')=($2::integer)::text
    ) SELECT DISTINCT lower(player) AS player FROM candidates
      WHERE player ~ '^0x[0-9a-fA-F]{40}$' ORDER BY player`,
    [apps.map(app => app.toLowerCase()), mode],
  );
  return rows.map(row => row.player as Address);
}

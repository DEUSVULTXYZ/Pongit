-- Additive read model. Envio owns each source schema and its rollback state.
-- No indexed rows are copied, deleted or rewritten by this migration.
BEGIN;
CREATE SCHEMA IF NOT EXISTS pongit_history;
CREATE OR REPLACE VIEW pongit_history.matches_raw AS
SELECT DISTINCT ON (id) id, deployment, "rawId", mode, ranked, "rulesVersion",
 "playerA", "playerB", "tournamentId", status, winner, played, "scoreA", "scoreB",
 "endedAt", "replayAvailability", block
FROM (
 SELECT m.*, 1 AS source_priority FROM indexer."Match" m
 UNION ALL SELECT m.*, 2 FROM arcade_five_20260929."Match" m
 UNION ALL SELECT m.*, 3 FROM agents_live_20260929."Match" m
) all_matches
ORDER BY id, block DESC, source_priority DESC;

CREATE OR REPLACE VIEW pongit_history."RecentReplays" AS
SELECT player AS id, array_agg(id ORDER BY "endedAt" DESC,id DESC) AS matches
FROM (
 SELECT id, "endedAt", player,
  row_number() OVER (PARTITION BY player ORDER BY "endedAt" DESC,id DESC) AS position
 FROM pongit_history.matches_raw
 CROSS JOIN LATERAL (SELECT "playerA" AS player UNION SELECT "playerB") players
 WHERE played
) ranked_matches WHERE position<=3 GROUP BY player;

CREATE OR REPLACE VIEW pongit_history."Match" AS
SELECT id, deployment, "rawId", mode, ranked, "rulesVersion", "playerA", "playerB",
 "tournamentId", status, winner, played, "scoreA", "scoreB", "endedAt",
 CASE WHEN "replayAvailability"='available' AND NOT EXISTS(
  SELECT 1 FROM pongit_history."RecentReplays" recent
  WHERE recent.id IN (m."playerA",m."playerB") AND m.id=ANY(recent.matches)
 ) THEN 'pruned' ELSE "replayAvailability" END AS "replayAvailability", block
FROM pongit_history.matches_raw m;
COMMIT;

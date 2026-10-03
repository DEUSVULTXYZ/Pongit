-- Extend the existing history read model. Every old schema remains intact.
BEGIN;
CREATE TEMP TABLE old_agent_history_refs ON COMMIT DROP AS
 SELECT id FROM pongit_history.matches_raw;
CREATE OR REPLACE VIEW pongit_history.matches_raw AS
SELECT DISTINCT ON (id) id, deployment, "rawId", mode, ranked, "rulesVersion",
 "playerA", "playerB", "tournamentId", status, winner, played, "scoreA", "scoreB",
 "endedAt", "replayAvailability", block
FROM (
 SELECT m.*, 1 AS source_priority FROM indexer."Match" m
 UNION ALL SELECT m.*, 2 FROM arcade_five_20260929."Match" m
 UNION ALL SELECT m.*, 3 FROM agents_live_20260929."Match" m
 UNION ALL SELECT m.*, 4 FROM agents_sync_20261003."Match" m
) all_matches
ORDER BY id, block DESC, source_priority DESC;
DO $$ BEGIN
 IF EXISTS(SELECT id FROM old_agent_history_refs EXCEPT SELECT id FROM pongit_history.matches_raw)
 THEN RAISE EXCEPTION 'Historical references disappeared'; END IF;
END $$;
COMMIT;

-- Apply once before starting rules-16 archival, against the existing agent DB.
-- No rows, identities, hashes or historical rules are rewritten. Old binaries
-- can still archive rules 14/15 after a service rollback. Keep this expanded
-- constraint on rollback so newly published rules-16 results remain readable.
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(701350);
DO $migration$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['il_reusable_results','il_reusable_slot_results'] LOOP
    -- Exact known constraint only: refuse an unexpected schema rather than
    -- dropping arbitrary checks. CREATE TABLE's original name is stable.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=target::regclass
      AND conname=target||'_rules_check' AND contype='c'
      AND pg_get_constraintdef(oid) IN ('CHECK ((rules = ANY (ARRAY[14, 15])))',
                                      'CHECK ((rules = ANY (ARRAY[14, 15, 16])))')) THEN
      RAISE EXCEPTION 'Unrecognized reusable archive rules constraint: %', target;
    END IF;
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I, ADD CONSTRAINT %I CHECK (rules IN (14,15,16))',
      target,target||'_rules_check',target||'_rules_check');
  END LOOP;
END $migration$;
COMMIT;

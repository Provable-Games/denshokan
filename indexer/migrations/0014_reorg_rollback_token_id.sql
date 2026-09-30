-- Drop the reorg-rollback backlog for `tokens`, one time, so the switch to
-- `idColumn: { tokens: "token_id" }` can land.
--
-- Every row already in airfoil.reorg_rollback was written by a trigger whose
-- id_col was the uuid `id`, so its row_id holds a uuid. The plugin builds the
-- rollback statement from the CURRENT id column, so after the switch it would
-- emit `... WHERE tokens.token_id = '3f2a1c9e-...'` and Postgres would reject
-- it with `invalid input syntax for type numeric` — a DrizzleStorageError that
-- aborts the indexer on the next reconnect, not a silent no-op.
--
-- Discarding the backlog costs the ability to roll back token writes for the
-- unfinalized tail. That is acceptable here and only here: `tokens` rows are
-- re-derived from chain state by scripts/fetch-token-uris.ts, so a reorg that
-- slipped through would be corrected on the next MetadataUpdate rather than
-- persisting. Scoped to `tokens` — every other table keeps its rollback rows,
-- and their triggers are unchanged.
--
-- Safe to re-run, and a no-op on a fresh database.

DO $$
BEGIN
  -- Apibara creates this table on indexer startup, after migrations. A fresh
  -- API/benchmark database has never started the indexer and has no backlog.
  IF to_regclass('airfoil.reorg_rollback') IS NOT NULL THEN
    DELETE FROM airfoil.reorg_rollback WHERE table_name = 'tokens';
  END IF;
END;
$$;

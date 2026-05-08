-- One-time cleanup for databases previously managed by @apibara/plugin-drizzle.
-- Run AFTER the new indexer has been deployed and you have verified that:
--   1. indexer_cursor has a row with id = 'denshokan' and order_key advancing
--   2. The indexer is processing new blocks without errors
--
-- Run with:
--   psql "$DATABASE_URL" -f scripts/drop-airfoil.sql
--
-- Removes:
--   - airfoil.checkpoints, airfoil.filters, airfoil.reorg_rollback,
--     airfoil.chain_reorganizations, airfoil.schema_version
--   - the airfoil.reorg_checkpoint() trigger function
--   - all <table>_reorg_indexer_denshokan_denshokan constraint triggers
--     (they depend on the function and are removed by CASCADE)

DROP SCHEMA IF EXISTS airfoil CASCADE;

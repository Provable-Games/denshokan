-- is_playable boundary fixtures for the API smoke test.
--
-- All rows share owner 0xf1 so the smoke test can isolate them from the
-- randomly-seeded data. Mirrors token_state::is_token_playable in
-- game-components:
--   playable = !game_over && !completed_all_objectives
--              && now >= minted_at + start_delay
--              && (end_delay = 0 OR now < minted_at + start_delay + end_delay)
-- Times are relative to now() so the fixtures stay valid whenever CI runs.
-- Expected playable set: 1001, 1004.
INSERT INTO tokens
  (token_id, game_id, minted_by, settings_id, minted_at, start_delay, end_delay,
   game_over, completed_all_objectives, owner_address, created_at_block, last_updated_block)
VALUES
  -- PLAYABLE: started (start_delay 0), never expires (end_delay 0)
  (1001, 999, 0, 0, (now() at time zone 'utc') - interval '1 hour', 0, 0, false, false, '0xf1', 1, 1),
  -- NOT playable: not started yet (start is in the future)
  (1002, 999, 0, 0, (now() at time zone 'utc') - interval '1 hour', 7200, 0, false, false, '0xf1', 1, 1),
  -- NOT playable: expired (end is in the past)
  (1003, 999, 0, 0, (now() at time zone 'utc') - interval '3 hours', 0, 3600, false, false, '0xf1', 1, 1),
  -- PLAYABLE: started, finite end still in the future
  (1004, 999, 0, 0, (now() at time zone 'utc') - interval '1 hour', 0, 7200, false, false, '0xf1', 1, 1),
  -- NOT playable: game over
  (1005, 999, 0, 0, (now() at time zone 'utc') - interval '1 hour', 0, 0, true, false, '0xf1', 1, 1),
  -- NOT playable: all objectives completed
  (1006, 999, 0, 0, (now() at time zone 'utc') - interval '1 hour', 0, 0, false, true, '0xf1', 1, 1);

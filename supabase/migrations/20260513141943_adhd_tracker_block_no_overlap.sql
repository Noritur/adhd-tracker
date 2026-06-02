create extension if not exists btree_gist;

alter table adhd_tracker.time_blocks
  add constraint time_blocks_no_overlap
  exclude using gist (
    user_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  );

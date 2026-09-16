-- Must run alone (own transaction) before the next migration, which
-- uses this new value — Postgres doesn't allow a new enum value to
-- be used in the same transaction it was added in.
alter type kindness_category add value if not exists 'other';

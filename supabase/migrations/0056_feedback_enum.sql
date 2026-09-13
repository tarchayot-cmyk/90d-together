-- Must run alone (own transaction) before 0057, which uses these
-- values — Postgres doesn't allow a new enum value to be used in
-- the same transaction it was added in.
alter type notification_type add value if not exists 'feedback_submitted';
alter type notification_type add value if not exists 'feedback_replied';

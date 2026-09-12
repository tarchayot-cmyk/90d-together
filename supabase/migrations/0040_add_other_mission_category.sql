-- Adds a generic catch-all mission category for custom missions
-- Admin creates beyond the original 12. Run this line alone first
-- if your SQL editor errors with "unsafe use of new value" when
-- combined with other statements in the same transaction.
alter type mission_category add value if not exists 'other';

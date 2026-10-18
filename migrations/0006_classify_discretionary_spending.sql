-- Existing records were created while every expense defaulted to "need".
-- Reclassify only the unambiguous discretionary categories. Goal movements
-- remain transfers and are deliberately excluded.
UPDATE transactions
SET need=0
WHERE type='expense'
  AND goal_id IS NULL
  AND category_id IN (
    SELECT id FROM categories
    WHERE lower(trim(name)) IN ('lifestyle', 'kopi & jajan kerja', 'hiburan', 'makan di luar')
  );

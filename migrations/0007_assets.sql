CREATE TABLE assets(
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'household',
  acquisition_cost INTEGER NOT NULL CHECK(acquisition_cost>0),
  current_value INTEGER NOT NULL CHECK(current_value>=0),
  acquired_at TEXT NOT NULL,
  disposed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_assets_household_active ON assets(household_id,disposed_at,acquired_at);
ALTER TABLE transactions ADD COLUMN asset_id TEXT;
CREATE INDEX idx_transactions_asset ON transactions(household_id,asset_id,tx_date);

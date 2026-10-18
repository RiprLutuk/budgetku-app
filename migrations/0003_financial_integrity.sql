ALTER TABLE goals ADD COLUMN purpose TEXT NOT NULL DEFAULT 'general' CHECK(purpose IN ('general','emergency'));
ALTER TABLE households ADD COLUMN essential_monthly INTEGER NOT NULL DEFAULT 0 CHECK(essential_monthly>=0);
ALTER TABLE transactions ADD COLUMN version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS transaction_audit(
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('update','delete')),
  actor_id TEXT NOT NULL,
  before_json TEXT NOT NULL,
  after_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transaction_audit_household ON transaction_audit(household_id,transaction_id,created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_goal_date ON transactions(household_id,goal_id,tx_date);

CREATE VIEW IF NOT EXISTS goal_daily_balances AS
SELECT g.id AS goal_id,g.household_id,t.tx_date,
  g.current+SUM(SUM(CASE WHEN t.type='expense' THEN t.amount ELSE -t.amount END))
    OVER (PARTITION BY g.id ORDER BY t.tx_date ROWS UNBOUNDED PRECEDING) AS balance
FROM goals g JOIN transactions t ON t.goal_id=g.id AND t.household_id=g.household_id
GROUP BY g.id,t.tx_date;

CREATE TRIGGER IF NOT EXISTS guard_goal_transaction_insert
BEFORE INSERT ON transactions WHEN NEW.goal_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT,'INVALID_GOAL') WHERE NOT EXISTS (
    SELECT 1 FROM goals WHERE id=NEW.goal_id AND household_id=NEW.household_id
  );
END;
CREATE TRIGGER IF NOT EXISTS guard_goal_transaction_update
BEFORE UPDATE OF goal_id,household_id ON transactions WHEN NEW.goal_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT,'INVALID_GOAL') WHERE NOT EXISTS (
    SELECT 1 FROM goals WHERE id=NEW.goal_id AND household_id=NEW.household_id
  );
END;
CREATE TRIGGER IF NOT EXISTS protect_goal_balance_insert
AFTER INSERT ON transactions WHEN NEW.goal_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT,'GOAL_BALANCE_NEGATIVE') WHERE EXISTS (
    SELECT 1 FROM goal_daily_balances WHERE goal_id=NEW.goal_id AND balance<0
  );
END;
CREATE TRIGGER IF NOT EXISTS protect_goal_balance_update
AFTER UPDATE OF goal_id,household_id,type,amount,tx_date ON transactions
WHEN NEW.goal_id IS NOT NULL OR OLD.goal_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT,'GOAL_BALANCE_NEGATIVE') WHERE EXISTS (
    SELECT 1 FROM goal_daily_balances WHERE goal_id IN (OLD.goal_id,NEW.goal_id) AND balance<0
  );
END;
CREATE TRIGGER IF NOT EXISTS protect_goal_balance_delete
AFTER DELETE ON transactions WHEN OLD.goal_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT,'GOAL_BALANCE_NEGATIVE') WHERE EXISTS (
    SELECT 1 FROM goal_daily_balances WHERE goal_id=OLD.goal_id AND balance<0
  );
END;
CREATE TRIGGER IF NOT EXISTS protect_goal_initial_balance
BEFORE UPDATE OF current ON goals
WHEN NEW.current<>OLD.current AND EXISTS (SELECT 1 FROM transactions WHERE goal_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'GOAL_INITIAL_LOCKED'); END;

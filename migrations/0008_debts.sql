CREATE TABLE debts(
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('payable','receivable')),
  person_name TEXT NOT NULL,
  principal INTEGER NOT NULL CHECK(principal>0),
  issued_date TEXT NOT NULL,
  due_date TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE debt_payments(
  id TEXT PRIMARY KEY,
  debt_id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount>0),
  paid_date TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_debts_household_due ON debts(household_id,due_date);
CREATE INDEX idx_debt_payments_debt ON debt_payments(debt_id,paid_date);

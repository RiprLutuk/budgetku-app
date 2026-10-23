CREATE TABLE debt_audit(
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  debt_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('create','payment','delete')),
  amount INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_debt_audit_debt ON debt_audit(household_id,debt_id,created_at);
CREATE TABLE login_rate_limits(key TEXT PRIMARY KEY,window_started INTEGER NOT NULL,attempts INTEGER NOT NULL);

CREATE TRIGGER guard_debt_payment_insert
BEFORE INSERT ON debt_payments
BEGIN
  SELECT RAISE(ABORT,'DEBT_PAYMENT_INVALID')
  WHERE NOT EXISTS (SELECT 1 FROM debts d WHERE d.id=NEW.debt_id AND d.household_id=NEW.household_id);
  SELECT RAISE(ABORT,'DEBT_PAYMENT_EXCEEDS_REMAINING')
  WHERE NEW.amount > (
    SELECT d.principal-COALESCE(SUM(p.amount),0)
    FROM debts d LEFT JOIN debt_payments p ON p.debt_id=d.id AND p.household_id=d.household_id
    WHERE d.id=NEW.debt_id AND d.household_id=NEW.household_id
    GROUP BY d.id
  );
  SELECT RAISE(ABORT,'DEBT_PAYMENT_MUST_SETTLE')
  WHERE (SELECT repayment_mode FROM debts WHERE id=NEW.debt_id AND household_id=NEW.household_id)='lump_sum'
    AND NEW.amount != (
      SELECT d.principal-COALESCE(SUM(p.amount),0)
      FROM debts d LEFT JOIN debt_payments p ON p.debt_id=d.id AND p.household_id=d.household_id
      WHERE d.id=NEW.debt_id AND d.household_id=NEW.household_id
      GROUP BY d.id
    );
END;

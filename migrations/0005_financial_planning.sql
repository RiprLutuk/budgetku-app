ALTER TABLE households ADD COLUMN planned_income INTEGER NOT NULL DEFAULT 0 CHECK(planned_income>=0);
ALTER TABLE households ADD COLUMN cash_opening_balance INTEGER NOT NULL DEFAULT 0 CHECK(cash_opening_balance>=0);
ALTER TABLE households ADD COLUMN cash_opening_date TEXT;

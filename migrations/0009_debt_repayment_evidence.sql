ALTER TABLE debts ADD COLUMN repayment_mode TEXT NOT NULL DEFAULT 'installment' CHECK(repayment_mode IN ('installment','lump_sum'));
ALTER TABLE debts ADD COLUMN evidence_key TEXT;
UPDATE debts SET repayment_mode='lump_sum' WHERE direction='receivable';

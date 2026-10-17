export const MONTHLY_SUMMARY_SQL = `
  SELECT substr(tx_date, 1, 7) AS month,
    COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END), 0) AS income,
    COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) AS expense,
    COALESCE(SUM(CASE WHEN type='expense' AND goal_id IS NOT NULL THEN amount ELSE 0 END), 0) AS goal_savings,
    COALESCE(SUM(CASE WHEN type='expense' AND need=1 AND goal_id IS NULL THEN amount ELSE 0 END), 0) AS needs_expense
  FROM transactions
  WHERE household_id=?
  GROUP BY substr(tx_date, 1, 7)
  ORDER BY month`;

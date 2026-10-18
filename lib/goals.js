export const GOALS_SNAPSHOT_SQL = `
  SELECT g.id,g.household_id,g.name,g.target,g.target_date,g.sort_order,g.purpose,
    g.current AS initial_balance,
    COALESCE(SUM(CASE WHEN t.type='expense' THEN t.amount ELSE -t.amount END),0) AS contributed,
    COUNT(t.id) AS contribution_count,
    g.current+COALESCE(SUM(CASE WHEN t.type='expense' THEN t.amount ELSE -t.amount END),0) AS current,
    EXISTS (SELECT 1 FROM transactions history WHERE history.goal_id=g.id AND history.household_id=g.household_id) AS has_history
  FROM goals g
  LEFT JOIN transactions t ON t.goal_id=g.id
    AND t.household_id=g.household_id AND t.tx_date<=?
  WHERE g.household_id=?
  GROUP BY g.id
  ORDER BY g.sort_order`;

export const GOAL_FOR_CATEGORY_SQL = `
  SELECT MIN(g.id) AS id
  FROM goals g
  JOIN categories c ON c.household_id=g.household_id
  WHERE c.id=? AND c.household_id=?
    AND (lower(trim(c.name))='target ' || lower(trim(g.name))
      OR (g.purpose='emergency' AND lower(trim(c.name))=lower(trim(g.name))))
  HAVING COUNT(*)=1`;

export const BACKFILL_GOAL_LINKS_SQL = `
  UPDATE transactions
  SET goal_id=(
    SELECT MIN(g.id)
    FROM goals g
    JOIN categories c ON c.household_id=g.household_id
    WHERE g.household_id=transactions.household_id
      AND c.id=transactions.category_id
      AND lower(trim(c.name))='target ' || lower(trim(g.name))
    HAVING COUNT(*)=1
  )
  WHERE type='expense' AND goal_id IS NULL AND category_id IS NOT NULL`;

export const GOAL_TRANSACTIONS_INDEX_SQL = `CREATE INDEX IF NOT EXISTS
  idx_transactions_household_goal ON transactions(household_id,goal_id,type)`;

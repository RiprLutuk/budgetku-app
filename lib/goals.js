export const GOALS_SNAPSHOT_SQL = `
  SELECT g.id,g.household_id,g.name,g.target,g.target_date,g.sort_order,
    g.current AS initial_balance,
    COALESCE(SUM(t.amount),0) AS contributed,
    g.current+COALESCE(SUM(t.amount),0) AS current
  FROM goals g
  LEFT JOIN transactions t ON t.goal_id=g.id
    AND t.household_id=g.household_id AND t.type='expense'
  WHERE g.household_id=?
  GROUP BY g.id
  ORDER BY g.sort_order`;

export const GOAL_FOR_CATEGORY_SQL = `
  SELECT MIN(g.id) AS id
  FROM goals g
  JOIN categories c ON c.household_id=g.household_id
  WHERE c.id=? AND c.household_id=?
    AND lower(trim(c.name))='target ' || lower(trim(g.name))
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

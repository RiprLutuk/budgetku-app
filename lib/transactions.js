export const MONTHLY_SUMMARY_SQL = `
  SELECT substr(tx_date, 1, 7) AS month,
    COALESCE(SUM(CASE WHEN type='income' AND goal_id IS NULL THEN amount ELSE 0 END), 0) AS income,
    COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) AS expense,
    COALESCE(SUM(CASE WHEN type='expense' AND goal_id IS NOT NULL THEN amount ELSE 0 END), 0) AS goal_savings,
    COALESCE(SUM(CASE WHEN type='expense' AND asset_id IS NOT NULL THEN amount ELSE 0 END), 0) AS asset_expense,
    COALESCE(SUM(CASE WHEN type='income' AND goal_id IS NOT NULL THEN amount ELSE 0 END), 0) AS goal_withdrawals,
    COALESCE(SUM(CASE WHEN type='expense' AND need=1 AND goal_id IS NULL AND asset_id IS NULL THEN amount ELSE 0 END), 0) AS needs_expense
  FROM transactions
  WHERE household_id=? AND tx_date<=?
  GROUP BY substr(tx_date, 1, 7)
  ORDER BY month`;

export function transactionAudit({ id, householdId, transactionId, actorId, action, version, after, createdAt }) {
  return {
    sql: `INSERT INTO transaction_audit(id,household_id,transaction_id,action,actor_id,before_json,after_json,created_at)
      SELECT ?,household_id,id,?,?,json_object(
        'id',id,'user_id',user_id,'type',type,'amount',amount,'note',note,'category_id',category_id,
        'goal_id',goal_id,'asset_id',asset_id,'tx_date',tx_date,'need',need,'paid_by',paid_by,'receipt_url',receipt_url,
        'source',source,'external_ref',external_ref,'created_at',created_at,'version',version),?,?
      FROM transactions WHERE id=? AND household_id=? AND version=?`,
    args: [id, action, actorId, after ? JSON.stringify(after) : null, createdAt, transactionId, householdId, version],
  };
}

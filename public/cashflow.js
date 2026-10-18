function amount(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function isEmergencyGoal(goal) {
  return goal?.purpose === 'emergency';
}

function goalBalances(goals = []) {
  return goals.reduce((totals, goal) => {
    const current = Math.max(0, amount(goal.current));
    totals.total += current;
    if (isEmergencyGoal(goal)) totals.emergency += current;
    return totals;
  }, { total: 0, emergency: 0 });
}

export function summarizeCashflow(monthlySummary = [], month, transactions = [], goals = [], household = {}) {
  const source = monthlySummary.length ? monthlySummary : buildMonthlySummary(transactions);
  const openingMonth = String(household.cash_opening_date || '').slice(0, 7);
  // An opening balance is a ledger anchor, not income.  Apply it only from
  // the configured start period so it cannot rewrite reports before the
  // household started keeping books in BudgetKu.
  const openingApplies = !openingMonth || openingMonth <= month;
  let openingBalance = openingApplies ? Math.max(0, amount(household.cash_opening_balance)) : 0;
  let income = 0;
  let goalWithdrawals = 0;
  let expense = 0;
  let goalSavings = 0;
  let assetExpense = 0;
  let needsExpense = 0;
  for (const summary of source) {
    const cashInflow = amount(summary.cash_inflow ?? amount(summary.income) + amount(summary.goal_withdrawals));
    if (summary.month < month && (!openingMonth || summary.month >= openingMonth)) {
      openingBalance += cashInflow - amount(summary.expense);
    } else if (summary.month === month) {
      income = amount(summary.income);
      goalWithdrawals = amount(summary.goal_withdrawals);
      expense = amount(summary.expense);
      goalSavings = amount(summary.goal_savings);
      assetExpense = amount(summary.asset_expense);
      needsExpense = amount(summary.needs_expense);
    }
  }
  const cashInflow = income + goalWithdrawals;
  const cashflow = cashInflow - expense;
  const availableBalance = openingBalance + cashflow;
  const balances = goalBalances(goals);
  return {
    openingBalance,
    income,
    goalWithdrawals,
    cashInflow,
    expense,
    assetExpense,
    spending: Math.max(0, expense - goalSavings - assetExpense),
    goalSavings,
    netGoalSavings: goalSavings - goalWithdrawals,
    needsExpense,
    cashflow,
    availableBalance,
    totalLiquidity: availableBalance + balances.total,
    emergencyGoalBalance: balances.emergency,
    totalGoalBalance: balances.total,
  };
}

export function financialHealth(summary = {}, monthlySummary = [], month, goals = [], household = {}, today = new Date()) {
  const income = Math.max(0, amount(summary.income));
  const needs = Math.max(0, amount(summary.needsExpense));
  const netGoalSavings = amount(summary.goalSavings) - amount(summary.goalWithdrawals);
  const savings = Math.max(0, netGoalSavings);
  const spending = Math.max(0, amount(summary.spending));
  const assetPurchases = Math.max(0, amount(summary.assetExpense));
  const wants = Math.max(0, spending - needs);
  const allocationBasis = income;
  const retained = income - spending;
  const unallocated = Math.max(0, retained - savings);
  const plannedOutflow = spending + savings + assetPurchases;
  const share = (value) => allocationBasis ? Math.round((value / allocationBasis) * 100) : 0;
  const allocation = {
    needs: share(needs),
    wants: share(wants),
    savings: share(savings),
    assetPurchases: share(assetPurchases),
    unallocated: share(Math.max(0, unallocated)),
  };
  const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const cutoff = month && month < thisMonth ? month : thisMonth;
  const completed = monthlySummary.filter((item) => item.month < cutoff).sort((left, right) => left.month.localeCompare(right.month));
  const recentNeeds = [];
  const [year, calendarMonth] = cutoff.split('-').map(Number);
  for (let offset = 3; offset >= 1; offset -= 1) {
    const date = new Date(year, calendarMonth - 1 - offset, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const item = completed.find((entry) => entry.month === key);
    if (amount(item?.needs_expense) > 0) recentNeeds.push(amount(item.needs_expense));
  }
  const configuredBaseline = Math.max(0, amount(household.essential_monthly));
  const observedBaseline = recentNeeds.length ? recentNeeds.reduce((sum, value) => sum + value, 0) / recentNeeds.length : 0;
  const needsBaseline = configuredBaseline || observedBaseline;
  const baselineSource = configuredBaseline ? 'estimasi kebutuhan dari Settings' : `rata-rata ${recentNeeds.length} bulan tercatat`;
  const availableBalance = amount(summary.availableBalance);
  const balances = goalBalances(goals);
  const operatingMonths = needsBaseline > 0 ? Math.max(0, availableBalance) / needsBaseline : null;
  const emergencyMonths = needsBaseline > 0 ? Math.max(0, availableBalance + balances.emergency) / needsBaseline : null;
  const totalMonths = needsBaseline > 0 ? Math.max(0, availableBalance + balances.total) / needsBaseline : null;
  const tone = emergencyMonths === null ? 'neutral' : emergencyMonths < 3 ? 'bad' : emergencyMonths < 6 ? 'good' : 'strong';
  const runway = {
    months: emergencyMonths,
    operatingMonths,
    emergencyMonths,
    totalMonths,
    baseline: needsBaseline,
    baselineSource,
    observedMonths: recentNeeds.length,
    emergencyBalance: balances.emergency,
    totalGoalBalance: balances.total,
    tone,
  };
  const allocationTone = income === 0
    ? 'neutral'
    : allocation.needs > 50 || allocation.wants > 30
      ? 'bad'
      : allocation.savings < 20
        ? 'warn'
        : 'good';
  return {
    income,
    needs,
    wants,
    savings,
    assetPurchases,
    allocationBasis,
    allocation,
    unallocated,
    deficit: Math.max(0, plannedOutflow - income),
    cashDeficit: Math.max(0, -amount(summary.cashflow)),
    savingsRate: income ? savings / income : null,
    cashRetentionRate: amount(summary.cashInflow) ? amount(summary.cashflow) / amount(summary.cashInflow) : null,
    netGoalSavings,
    cashSurplus: amount(summary.cashflow),
    allocationTone,
    runway,
  };
}

export function buildMonthlySummary(transactions = []) {
  const byMonth = new Map();
  for (const transaction of transactions) {
    const month = String(transaction.tx_date || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    const summary = byMonth.get(month) || { month, income: 0, goal_withdrawals: 0, cash_inflow: 0, expense: 0, goal_savings: 0, asset_expense: 0, needs_expense: 0 };
    if (transaction.type === 'income') {
      if (transaction.goal_id) summary.goal_withdrawals += amount(transaction.amount);
      else summary.income += amount(transaction.amount);
      summary.cash_inflow += amount(transaction.amount);
    }
    if (transaction.type === 'expense') {
      summary.expense += amount(transaction.amount);
      if (transaction.goal_id) summary.goal_savings += amount(transaction.amount);
      if (transaction.asset_id) summary.asset_expense += amount(transaction.amount);
      if (transaction.need && !transaction.goal_id && !transaction.asset_id) summary.needs_expense += amount(transaction.amount);
    }
    byMonth.set(month, summary);
  }
  return [...byMonth.values()].sort((left, right) => left.month.localeCompare(right.month));
}

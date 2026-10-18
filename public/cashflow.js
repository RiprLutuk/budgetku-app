export function summarizeCashflow(monthlySummary = [], month, transactions = []) {
  const source = monthlySummary.length ? monthlySummary : buildMonthlySummary(transactions);
  let openingBalance = 0;
  let income = 0;
  let expense = 0;
  let goalSavings = 0;
  let needsExpense = 0;
  for (const summary of source) {
    if (summary.month < month) {
      openingBalance += Number(summary.income) - Number(summary.expense);
    } else if (summary.month === month) {
      income = Number(summary.income);
      expense = Number(summary.expense);
      goalSavings = Number(summary.goal_savings || 0);
      needsExpense = Number(summary.needs_expense || 0);
    }
  }
  const cashflow = income - expense;
  return { openingBalance, income, expense, spending: expense - goalSavings, goalSavings, needsExpense, cashflow, availableBalance: openingBalance + cashflow };
}

export function financialHealth(summary = {}, monthlySummary = [], month, today = new Date()) {
  const income = Math.max(0, Number(summary.income || 0));
  const needs = Math.max(0, Number(summary.needsExpense || 0));
  const savings = Math.max(0, Number(summary.goalSavings || 0));
  const spending = Math.max(0, Number(summary.spending || 0));
  const wants = Math.max(0, spending - needs);
  const allocationBasis = income;
  const unallocated = Math.max(0, income - needs - wants - savings);
  const share = (amount) => allocationBasis ? Math.round((amount / allocationBasis) * 100) : 0;
  const allocation = {
    needs: share(needs),
    wants: share(wants),
    savings: share(savings),
    unallocated: share(unallocated),
  };
  const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const cutoff = month && month < thisMonth ? month : thisMonth;
  const completed = monthlySummary.filter((item) => item.month < cutoff).sort((left, right) => left.month.localeCompare(right.month));
  const firstMonth = completed[0]?.month;
  const recentNeeds = [];
  const [year, calendarMonth] = cutoff.split('-').map(Number);
  for (let offset = 3; offset >= 1; offset--) {
    const date = new Date(year, calendarMonth - 1 - offset, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (firstMonth && key >= firstMonth) recentNeeds.push(Number(completed.find((item) => item.month === key)?.needs_expense || 0));
  }
  const needsBaseline = recentNeeds.length
    ? recentNeeds.reduce((sum, value) => sum + value, 0) / recentNeeds.length
    : 0;
  const availableBalance = Number(summary.availableBalance || 0);
  const runwayMonths = needsBaseline > 0 ? Math.max(0, availableBalance) / needsBaseline : null;
  const runway = {
    months: runwayMonths,
    baseline: needsBaseline,
    observedMonths: recentNeeds.length,
    tone: runwayMonths === null ? 'neutral' : runwayMonths < 3 ? 'bad' : runwayMonths < 6 ? 'good' : 'strong',
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
    allocationBasis,
    allocation,
    unallocated,
    allocationTone,
    runway,
  };
}

function buildMonthlySummary(transactions) {
  const byMonth = new Map();
  for (const transaction of transactions) {
    const month = transaction.tx_date.slice(0, 7);
    const summary = byMonth.get(month) || { month, income: 0, expense: 0, goal_savings: 0, needs_expense: 0 };
    if (transaction.type === 'income') summary.income += Number(transaction.amount);
    if (transaction.type === 'expense') {
      summary.expense += Number(transaction.amount);
      if (transaction.goal_id) summary.goal_savings += Number(transaction.amount);
      if (transaction.need && !transaction.goal_id) summary.needs_expense += Number(transaction.amount);
    }
    byMonth.set(month, summary);
  }
  return [...byMonth.values()].sort((left, right) => left.month.localeCompare(right.month));
}

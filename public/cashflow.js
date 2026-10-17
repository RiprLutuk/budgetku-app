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
      goalSavings = Number(summary.goal_savings);
      needsExpense = Number(summary.needs_expense);
    }
  }
  const cashflow = income - expense;
  return { openingBalance, income, expense, goalSavings, needsExpense, cashflow, availableBalance: openingBalance + cashflow };
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

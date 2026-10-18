import { localDateValue } from './forms.js';

export function goalProgress(current, target) {
  if (!(Number(target) > 0)) return 0;
  if (Number(current) >= Number(target)) return 100;
  return Math.min(99, Math.max(0, Math.round(Number(current) / Number(target) * 100)));
}

export function goalPlan(goal, today = localDateValue()) {
  const remaining = Math.max(0, Number(goal.target || 0) - Number(goal.current || 0));
  const complete = remaining === 0 && Number(goal.target) > 0;
  const overdue = !complete && Boolean(goal.target_date && goal.target_date < today);
  let months = null;
  if (goal.target_date && !complete) {
    const [year, month] = today.split('-').map(Number);
    const [targetYear, targetMonth] = goal.target_date.split('-').map(Number);
    months = Math.max(1, (targetYear - year) * 12 + targetMonth - month + 1);
  }
  return { remaining, complete, overdue, months, perMonth: months ? Math.ceil(remaining / months) : null };
}

export function summarizeGoals(goals = []) {
  return goals.reduce((total, goal) => {
    const target = Number(goal.target || 0);
    const current = Number(goal.current || 0);
    total.target += target;
    total.current += current;
    total.funded += Math.min(target, current);
    total.remaining += Math.max(0, target - current);
    if (current >= target && target > 0) total.completed++;
    else total.active++;
    return total;
  }, { target: 0, current: 0, funded: 0, remaining: 0, active: 0, completed: 0 });
}

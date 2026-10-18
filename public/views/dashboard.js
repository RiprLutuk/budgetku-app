import { escapeHtml, icon } from '../ui.js';

const monthDate = (month) => new Date(`${month}-01T00:00:00`);
const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const shiftMonth = (month, offset) => {
  const date = monthDate(month);
  date.setMonth(date.getMonth() + offset);
  return monthKey(date);
};
const monthLabel = (month) => new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(monthDate(month));
const progress = (current, target) => target ? Math.round((current / target) * 100) : 0;

function cashflowBars(monthlySummary, currentMonth) {
  const months = Array.from({ length: 6 }, (_, index) => shiftMonth(currentMonth, index - 5));
  const values = months.map((month) => monthlySummary.find((item) => item.month === month) || { month, income: 0, expense: 0 });
  const maximum = Math.max(1, ...values.flatMap((item) => [Number(item.income), Number(item.expense)]));
  return values.map((item) => `<div class="cashflow-month${item.month === currentMonth ? ' is-current' : ''}" title="${monthLabel(item.month)}: ${item.income ? `Masuk ${item.income}` : 'Belum ada pemasukan'}, ${item.expense ? `keluar ${item.expense}` : 'belum ada pengeluaran'}">
    <div class="cashflow-bars"><span class="cashflow-in" style="height:${Math.max(4, (Number(item.income) / maximum) * 100)}%"></span><span class="cashflow-out" style="height:${Math.max(4, (Number(item.expense) / maximum) * 100)}%"></span></div>
    <span>${monthLabel(item.month)}</span>
  </div>`).join('');
}

function goalProgress(goal, index) {
  const value = Math.min(100, progress(goal.current, goal.target));
  return `<div class="goal-track-row${index === 0 ? ' goal-track-featured' : ''}">
    <div class="goal-track-icon goal-tone-${index % 3}">${icon(index === 0 ? 'target' : index === 1 ? 'vault' : 'spark')}</div>
    <div class="goal-track-copy"><div class="goal-track-head"><strong>${escapeHtml(goal.name)}</strong><span>${value}%</span></div><div class="goal-track-bar"><span style="width:${value}%"></span></div><small>${goal.current ? `${goal.current.toLocaleString('id-ID')} terkumpul` : 'Belum ada setoran'} <em>/ ${goal.target.toLocaleString('id-ID')}</em></small></div>
  </div>`;
}

function transactionGlyph(transaction) {
  if (transaction.goal_id) return icon('target');
  if (transaction.type === 'income') return icon('inflow');
  if (transaction.need) return icon('ledger');
  return icon('spark');
}

function transactionRows(rows) {
  if (!rows.length) return '<div class="empty">Belum ada transaksi di bulan ini.</div>';
  return rows.map((transaction) => `<div class="ledger-row">
    <div class="ledger-glyph ${transaction.type === 'income' ? 'is-inflow' : transaction.goal_id ? 'is-goal' : 'is-outflow'}">${transactionGlyph(transaction)}</div>
    <div class="ledger-copy"><strong>${escapeHtml(transaction.note)}</strong><small>${escapeHtml(transaction.category_name || (transaction.type === 'income' ? 'Pemasukan' : 'Tanpa kategori'))} · ${escapeHtml(transaction.created_by_name)} · ${escapeHtml(transaction.tx_date)}</small></div>
    <div class="ledger-amount ${transaction.type}">${transaction.type === 'expense' ? '-' : '+'}${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(transaction.amount)}</div>
    <button class="icon-btn danger-action delete-tx" data-id="${transaction.id}" title="Hapus transaksi" aria-label="Hapus transaksi">${icon('trash')}</button>
  </div>`).join('');
}

function metric(label, value, note, tone = '') {
  return `<div class="rail-stat"><span>${label}</span><strong class="${tone}">${value}</strong><small>${note}</small></div>`;
}

export function renderDashboard(container, { snapshot, currentMonth, summary, monthName, rupiah, insightItems, onBind }) {
  const available = summary.availableBalance;
  const carried = summary.openingBalance;
  const today = new Date();
  const isCurrentMonth = currentMonth === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const daysLeft = isCurrentMonth ? new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate() + 1 : 0;
  const safeDay = isCurrentMonth ? Math.floor(Math.max(0, available) / Math.max(1, daysLeft)) : 0;
  const balanceNote = carried > 0 ? `${rupiah(carried)} rollover` : carried < 0 ? `${rupiah(Math.abs(carried))} defisit terbawa` : 'Belum ada saldo bawaan';
  const insights = insightItems.slice(0, 2);
  const selectedGoals = snapshot.goals.slice(0, 3);

  container.innerHTML = `<div class="content dashboard-content">
    <section class="balance-hero">
      <div class="balance-hero-grid"></div>
      <div class="balance-hero-top"><div><span class="eyebrow">AVAILABLE BALANCE / ${escapeHtml(monthName)}</span><h2>Saldo tersedia</h2></div><div class="live-mark"><span></span>LIVE SYNC</div></div>
      <div class="balance-hero-amount" data-balance-tone="${available < 0 ? 'negative' : 'positive'}">${rupiah(available)}</div>
      <div class="balance-hero-sub"><span>${balanceNote}</span><span>${rupiah(summary.cashflow)} arus kas bulan ini</span></div>
      <div class="balance-hero-rail">
        ${metric('MONEY IN', rupiah(summary.income), 'bulan aktif', 'is-inflow')}
        ${metric('MONEY OUT', rupiah(summary.expense), `${summary.income ? Math.round((summary.expense / summary.income) * 100) : 0}% dari income`, 'is-outflow')}
        ${metric('SAFE / DAY', rupiah(safeDay), isCurrentMonth ? `${daysLeft} hari tersisa` : 'lihat bulan aktif')}
        <div class="hero-sparkline"><span>6 BULAN</span><div class="cashflow-chart">${cashflowBars(snapshot.monthlySummary || [], currentMonth)}</div></div>
      </div>
    </section>

    <div class="dashboard-grid">
      <section class="surface-panel insight-panel"><div class="panel-heading"><div><span class="eyebrow">SIGNALS</span><h3>Perlu perhatian</h3></div><span class="panel-count">${insights.length}</span></div>${insights.map((item) => `<div class="signal-row ${item.kind}"><span class="signal-dot"></span><p>${escapeHtml(item.text)}</p></div>`).join('')}</section>
      <section class="surface-panel goals-panel"><div class="panel-heading"><div><span class="eyebrow">LONG TERM</span><h3>Goals keluarga</h3></div><button class="text-action" data-go="goals">Lihat semua ${icon('arrow')}</button></div><div class="goal-track-list">${selectedGoals.length ? selectedGoals.map(goalProgress).join('') : '<div class="empty">Belum ada goal.</div>'}</div></section>
    </div>

    <section class="surface-panel ledger-panel"><div class="panel-heading"><div><span class="eyebrow">ACTIVITY / ${escapeHtml(monthName)}</span><h3>Ledger terbaru</h3></div><button class="text-action" data-go="transactions">Semua transaksi ${icon('arrow')}</button></div><div class="ledger-list">${transactionRows(snapshot.transactions.filter((item) => item.tx_date.slice(0, 7) === currentMonth).slice(0, 6))}</div></section>
  </div>`;
  onBind();
}

export function renderTransactions(container, { snapshot, onBind, rupiah }) {
  container.innerHTML = `<div class="content"><section class="surface-panel ledger-panel full-ledger"><div class="panel-heading"><div><span class="eyebrow">ALL ACTIVITY</span><h3>Semua transaksi</h3><small>${snapshot.transactions.length} transaksi tersimpan di server</small></div><button id="addTx2" class="primary"><span data-icon="plus">${icon('plus')}</span><span>Catat baru</span></button></div><div class="ledger-list">${transactionRows(snapshot.transactions)}</div></section></div>`;
  onBind();
}

import { escapeHtml, icon } from '../ui.js';
import { goalProgress as calculateGoalProgress } from '../goal-math.js';
import { categoryIconFor, goalIconForName } from '../goal-icons.js';

const monthDate = (month) => new Date(`${month}-01T00:00:00`);
const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const shiftMonth = (month, offset) => {
  const date = monthDate(month);
  date.setMonth(date.getMonth() + offset);
  return monthKey(date);
};
const monthLabel = (month) => new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(monthDate(month));
const money = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0));
const shortDate = (date) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(`${date}T00:00:00`));

function cashflowBars(monthlySummary, currentMonth) {
  const months = Array.from({ length: 6 }, (_, index) => shiftMonth(currentMonth, index - 5));
  const values = months.map((month) => monthlySummary.find((item) => item.month === month) || { month, cash_inflow: 0, expense: 0 });
  const maximum = Math.max(1, ...values.flatMap((item) => [Number(item.cash_inflow ?? item.income), Number(item.expense)]));
  return values.map((item) => `<div class="cashflow-month${item.month === currentMonth ? ' is-current' : ''}" title="${monthLabel(item.month)}: masuk ${money(item.cash_inflow ?? item.income)}, kas keluar ${money(item.expense)}">
    <div class="cashflow-bars"><span class="cashflow-in" style="height:${Math.max(4, (Number(item.cash_inflow ?? item.income) / maximum) * 100)}%"></span><span class="cashflow-out" style="height:${Math.max(4, (Number(item.expense) / maximum) * 100)}%"></span></div>
    <span>${monthLabel(item.month)}</span>
  </div>`).join('');
}

function goalProgress(goal, index) {
  const value = calculateGoalProgress(goal.current, goal.target);
  return `<div class="goal-track-row${index === 0 ? ' goal-track-featured' : ''}">
    <div class="goal-track-icon goal-tone-${index % 3}">${icon(goalIconForName(goal.name, goal.purpose))}</div>
    <div class="goal-track-copy"><div class="goal-track-head"><strong>${escapeHtml(goal.name)}</strong><span>${value}%</span></div><div class="goal-track-bar"><span style="width:${value}%"></span></div><small>${money(goal.current)} <em>/ ${money(goal.target)}</em></small></div>
  </div>`;
}

function transactionGlyph(transaction) {
  if (transaction.asset_id) return icon('vault');
  if (transaction.goal_id) return icon(transaction.type === 'income' ? 'down' : goalIconForName(transaction.goal_name));
  return icon(categoryIconFor({ category: transaction.category_name, note: transaction.note, type: transaction.type }));
}

function transactionRows(rows) {
  if (!rows.length) return '<div class="empty">Belum ada transaksi di bulan ini.</div>';
  return rows.map((transaction) => {
    const isGoalWithdrawal = transaction.type === 'income' && transaction.goal_id;
    const label = transaction.asset_id ? 'Pembelian aset' : isGoalWithdrawal ? `Pencairan ${transaction.goal_name || 'goal'}` : transaction.goal_id ? `Tabungan ${transaction.goal_name || 'goal'}` : transaction.category_name || (transaction.type === 'income' ? 'Pemasukan' : 'Tanpa kategori');
    const tone = transaction.asset_id ? 'is-asset' : isGoalWithdrawal ? 'is-inflow' : transaction.type === 'income' ? 'is-inflow' : transaction.goal_id ? 'is-goal' : 'is-outflow';
    return `<button type="button" class="ledger-row edit-tx" data-id="${escapeHtml(transaction.id)}" aria-label="Buka transaksi ${escapeHtml(transaction.note)}, ${money(transaction.amount)}">
      <span class="ledger-glyph ${tone}">${transactionGlyph(transaction)}</span>
      <span class="ledger-copy"><span class="ledger-main"><strong>${escapeHtml(transaction.note)}</strong><span class="ledger-amount ${isGoalWithdrawal || transaction.type === 'income' ? 'income' : transaction.goal_id ? 'savings' : 'expense'}">${transaction.type === 'expense' ? '-' : '+'}${money(transaction.amount)}</span></span><span class="ledger-meta"><span class="ledger-category">${escapeHtml(label)}</span><span class="ledger-member">${escapeHtml(transaction.created_by_name)}</span><time datetime="${escapeHtml(transaction.tx_date)}">${shortDate(transaction.tx_date)}</time></span></span>
    </button>`;
  }).join('');
}

function metric(label, value, tone = '') {
  return `<div class="rail-stat"><span>${label}</span><strong class="${tone}">${value}</strong></div>`;
}

function allocationToneLabel(health) {
  if (!health.income) return 'Belum ada pemasukan';
  if (health.allocation.needs > 50) return `Kebutuhan ${health.allocation.needs}%`;
  if (health.allocation.wants > 30) return `Keinginan ${health.allocation.wants}%`;
  if (health.allocation.savings < 20) return `Tabungan ${health.allocation.savings}%`;
  return 'Sesuai rencana';
}

function allocationWidth(value, total) {
  return total ? Math.min(100, Math.max(0, Number(value || 0) / total * 100)) : 0;
}

function renderAllocation(health) {
  const items = [
    { key: 'needs', label: 'Kebutuhan', className: 'needs' },
    { key: 'wants', label: 'Keinginan', className: 'wants' },
    { key: 'savings', label: 'Tabungan', className: 'savings' },
    { key: 'assetPurchases', label: 'Aset', className: 'assets' },
    { key: 'unallocated', label: 'Sisa', className: 'unallocated' },
  ];
  const visualTotal = Math.max(health.income, health.needs + health.wants + health.savings + health.assetPurchases + Math.max(0, health.unallocated));
  return `<div class="allocation-stack" role="img" aria-label="Alokasi pemasukan: kebutuhan ${health.allocation.needs} persen, keinginan ${health.allocation.wants} persen, tabungan ${health.allocation.savings} persen, pembelian aset ${health.allocation.assetPurchases} persen, belum dialokasikan ${health.allocation.unallocated} persen">${items.map((item) => `<span class="allocation-segment ${item.className}" style="width:${health.income ? allocationWidth(health[item.key], visualTotal) : 0}%"></span>`).join('')}</div>
    <div class="allocation-legend">${items.map((item) => `<div class="allocation-item"><span class="allocation-dot ${item.className}"></span><span><strong>${item.label}</strong><small>${health.allocation[item.key]}%</small></span></div>`).join('')}</div>`;
}

function renderRunway(health, rupiah) {
  const months = health.runway.emergencyMonths;
  const title = months === null ? 'Belum terukur' : `${months.toFixed(1)} bulan`;
  const detail = months === null ? 'Atur kebutuhan esensial' : `Basis ${rupiah(health.runway.baseline)} / bulan`;
  return `<button type="button" class="runway-card runway-compact" ${months === null ? 'data-go="settings"' : ''} ${months === null ? '' : 'disabled'}><span class="runway-icon">${icon('shield')}</span><span class="runway-copy"><span class="health-label">Dana darurat</span><strong class="runway-value tone-${health.runway.tone}${months === null ? ' is-empty' : ''}">${title}</strong></span><span class="runway-detail">${detail}${months === null ? icon('arrow') : ''}</span></button>`;
}

export function renderDashboard(container, { snapshot, currentMonth, summary, health, monthName, rupiah, insightItems, privacyButton, onBind }) {
  const available = summary.availableBalance;
  const carried = summary.openingBalance;
  const balanceNote = carried > 0 ? `Termasuk sisa bulan lalu ${rupiah(carried)}` : carried < 0 ? `Masih menutup kekurangan ${rupiah(Math.abs(carried))}` : 'Belum ada sisa dari bulan lalu';
  const cashflowNote = summary.cashflow < 0 ? `Berkurang ${rupiah(Math.abs(summary.cashflow))} bulan ini` : `Bertambah ${rupiah(summary.cashflow)} bulan ini`;
  const balanceContext = carried ? `${balanceNote} · ${cashflowNote}` : cashflowNote;
  const insights = insightItems.slice(0, 2);
  const selectedGoals = snapshot.goals.slice(0, 3);
  const historyOpen = container.querySelector('.hero-history')?.open || false;

  container.innerHTML = `<div class="content dashboard-content">
    <section class="balance-hero">
      <div class="balance-hero-grid"></div>
      <div class="balance-hero-top"><div><h2>Uang yang bisa dipakai</h2><span class="balance-period">${escapeHtml(monthName)}</span></div><div class="balance-hero-actions"><div class="live-mark"><span></span>TERKINI</div><span class="balance-privacy-anchor"></span></div></div>
      <div class="balance-hero-value"><div class="balance-hero-amount" data-balance-tone="${available < 0 ? 'negative' : 'positive'}">${rupiah(available)}</div></div>
      <div class="balance-hero-sub"><span>${balanceContext}</span></div>
      <div class="balance-hero-rail">
        ${metric('UANG MASUK', rupiah(summary.income), 'is-inflow')}
        ${metric('UANG KELUAR', rupiah(summary.spending), 'is-outflow')}
        ${metric('MASUK TABUNGAN', rupiah(summary.goalSavings))}
      </div>
      <details class="hero-history"${historyOpen ? ' open' : ''}><summary>Riwayat 6 bulan ${icon('chevron')}</summary><div class="hero-sparkline"><div class="cashflow-chart">${cashflowBars(snapshot.monthlySummary || [], currentMonth)}</div></div></details>
    </section>

    <section class="surface-panel health-panel" aria-labelledby="healthTitle">
      <div class="panel-heading"><div><h3 id="healthTitle">Pembagian uang bulan ini</h3></div><span class="health-badge tone-${health.allocationTone}">${allocationToneLabel(health)}</span></div>
      <div class="health-grid"><div class="allocation-block"><div class="health-block-head"><strong>Kebutuhan · keinginan · tabungan</strong><span>${health.income ? rupiah(health.income) : 'Belum ada data'}</span></div>${renderAllocation(health)}</div>${renderRunway(health, rupiah)}</div>
    </section>

    <div class="dashboard-grid">
      <section class="surface-panel insight-panel"><div class="panel-heading"><div><h3>Perlu diperhatikan</h3></div><span class="panel-count">${insights.length}</span></div>${insights.map((item) => `<div class="signal-row ${item.kind}"><span class="signal-dot"></span><p>${escapeHtml(item.text)}</p></div>`).join('')}</section>
      <section class="surface-panel goals-panel"><div class="panel-heading"><div><h3>Tabungan</h3></div><div class="panel-actions"><button type="button" class="text-action" data-quick-goal>${icon('plus')} Tambah</button><button class="text-action" data-go="goals">Lihat semua ${icon('arrow')}</button></div></div><div class="goal-track-list">${selectedGoals.length ? selectedGoals.map(goalProgress).join('') : '<div class="empty">Belum ada tujuan tabungan.<button type="button" class="text-action" data-quick-goal style="margin-top:4px">' + icon('plus') + ' Tambah tujuan</button></div>'}</div></section>
    </div>

    <section class="surface-panel ledger-panel"><div class="panel-heading"><div><span class="eyebrow">${escapeHtml(monthName)}</span><h3>Transaksi terbaru</h3></div><button class="text-action" data-go="transactions" aria-label="Lihat semua transaksi">Lihat semua ${icon('arrow')}</button></div><div class="ledger-list">${transactionRows(snapshot.transactions.filter((item) => item.tx_date.slice(0, 7) === currentMonth).slice(0, 6))}</div></section>
  </div>`;
  privacyButton.hidden = false;
  container.querySelector('.balance-privacy-anchor').append(privacyButton);
  onBind();
}

function monitoringSpending(transaction) {
  return transaction.type === 'expense' && !transaction.goal_id && !transaction.asset_id;
}

function monthlySpending(summary) {
  return Math.max(0, Number(summary?.expense || 0) - Number(summary?.goal_savings || 0) - Number(summary?.asset_expense || 0));
}

function monitoringMonthLabel(month) {
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(monthDate(month));
}

export function renderMonitoring(container, { snapshot, currentMonth, rupiah }) {
  const transactions = snapshot.transactions.filter(monitoringSpending);
  const total = transactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const previousMonth = shiftMonth(currentMonth, -1);
  const previous = monthlySpending((snapshot.monthlySummary || []).find((item) => item.month === previousMonth));
  const delta = total - previous;
  const deltaText = previous ? `${delta > 0 ? '+' : ''}${Math.round(delta / previous * 100)}% vs ${monthLabel(previousMonth)}` : 'Belum ada pembanding bulan lalu';
  const [year, month] = currentMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  const trackedDays = currentMonth === monthKey(today) ? Math.min(daysInMonth, today.getDate()) : daysInMonth;
  const daily = Array.from({ length: daysInMonth }, (_, index) => ({ day: index + 1, total: 0 }));
  for (const transaction of transactions) {
    const day = Number(String(transaction.tx_date).slice(8, 10));
    if (daily[day - 1]) daily[day - 1].total += Number(transaction.amount || 0);
  }
  const maxDaily = Math.max(1, ...daily.map((item) => item.total));
  const categories = new Map();
  for (const transaction of transactions) {
    const label = transaction.category_name || 'Tanpa kategori';
    categories.set(label, (categories.get(label) || 0) + Number(transaction.amount || 0));
  }
  const ranking = [...categories.entries()].map(([label, amount]) => ({ label, amount })).sort((left, right) => right.amount - left.amount);
  const top = ranking[0];
  const average = trackedDays ? total / trackedDays : 0;
  const peak = daily.reduce((winner, item) => item.total > winner.total ? item : winner, daily[0]);
  const todayKey = new Date().toISOString().slice(0, 10);
  const receivables = (snapshot.debts || []).map((item) => ({ ...item, remaining: Number(item.principal) - Number(item.paid_amount) })).filter((item) => item.direction === 'receivable' && item.remaining > 0);
  const receivableTotal = receivables.reduce((sum, item) => sum + item.remaining, 0);
  const overdueReceivables = receivables.filter((item) => item.due_date && item.due_date < todayKey);
  const personalSpending = transactions.filter((item) => !/kontrakan|rumah/i.test(String(item.category_name || '')) && item.paid_by && item.paid_by !== 'shared');
  const spendingByMember = (snapshot.members || []).map((member) => ({ name: member.name, amount: personalSpending.filter((item) => item.paid_by === member.id).reduce((sum, item) => sum + Number(item.amount || 0), 0) })).filter((item) => item.amount > 0).sort((left, right) => right.amount - left.amount);
  const topSpender = spendingByMember[0];

  container.innerHTML = `<div class="content monitoring-content">
    <section class="monitoring-intro"><p>Belanja konsumtif ${escapeHtml(monitoringMonthLabel(currentMonth))}. Tabungan dan pembelian aset tidak dihitung.</p></section>
    <section class="monitoring-kpis" aria-label="Ringkasan pengeluaran">
      <article><span>Belanja bulan ini</span><strong>${rupiah(total)}</strong><small class="${delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : ''}">${escapeHtml(deltaText)}</small></article>
      <article><span>Rata-rata per hari</span><strong>${rupiah(average)}</strong><small>${trackedDays} hari terpantau</small></article>
      <article><span>Pengeluaran terbesar</span><strong>${top ? escapeHtml(top.label) : '—'}</strong><small>${top ? rupiah(top.amount) : 'Belum ada transaksi'}</small></article>
      <article><span>Hari paling tinggi</span><strong>${peak?.total ? `${peak.day} ${monthLabel(currentMonth)}` : '—'}</strong><small>${peak?.total ? rupiah(peak.total) : 'Belum ada transaksi'}</small></article>
    </section>
    <section class="surface-panel monitoring-chart-panel"><div class="panel-heading"><div><h3>Belanja harian</h3><small>Bandingkan lonjakan antarhari untuk menemukan kebiasaan belanja.</small></div><strong>${rupiah(total)}</strong></div><div class="daily-chart" role="img" aria-label="Chart belanja harian ${escapeHtml(monitoringMonthLabel(currentMonth))}">${daily.map((item) => `<div class="daily-bar" title="Tanggal ${item.day}: ${rupiah(item.total)}"><span style="height:${item.total ? Math.max(4, item.total / maxDaily * 100) : 0}%"></span>${item.day === 1 || item.day === daysInMonth || item.day % 5 === 0 ? `<small>${item.day}</small>` : ''}</div>`).join('')}</div></section>
    <section class="surface-panel monitoring-ranking"><div class="panel-heading"><div><h3>Habis untuk apa?</h3><small>Lima kategori dengan pengeluaran tertinggi.</small></div><span class="panel-count">${ranking.length}</span></div>${ranking.length ? `<ol>${ranking.slice(0, 5).map((item) => `<li><div><span>${escapeHtml(item.label)}</span><div class="monitoring-rank-track"><i style="width:${total ? item.amount / total * 100 : 0}%"></i></div></div><strong>${rupiah(item.amount)}</strong><small>${total ? Math.round(item.amount / total * 100) : 0}%</small></li>`).join('')}</ol>` : '<div class="empty">Belum ada pengeluaran konsumtif pada periode ini.</div>'}</section>
    <section class="surface-panel monitoring-members"><div class="panel-heading"><div><h3>Siapa paling banyak belanja?</h3><small>Hanya transaksi pribadi; Kontrakan / Rumah dan transaksi Bersama tidak dihitung.</small></div></div>${topSpender ? `<div class="member-spend-lead"><span>Terbanyak bulan ini</span><strong>${escapeHtml(topSpender.name)}</strong><b>${rupiah(topSpender.amount)}</b></div><div class="member-spend-list">${spendingByMember.slice(0, 2).map((item) => `<div><span>${escapeHtml(item.name)}</span><i style="width:${topSpender.amount ? item.amount / topSpender.amount * 100 : 0}%"></i><strong>${rupiah(item.amount)}</strong></div>`).join('')}</div>` : '<div class="empty">Belum ada transaksi pribadi untuk dibandingkan.</div>'}</section>
    <section class="surface-panel monitoring-receivables"><div class="panel-heading"><div><h3>Monitoring piutang</h3><small>${overdueReceivables.length ? `${overdueReceivables.length} melewati jatuh tempo` : 'Semua piutang aktif terpantau'}</small></div><button class="text-action" data-go="debts">Kelola ${icon('arrow')}</button></div><div class="receivable-total"><span>Total akan diterima</span><strong>${rupiah(receivableTotal)}</strong></div>${receivables.length ? `<div class="receivable-list">${receivables.slice(0, 3).map((item) => `<div><span>${escapeHtml(item.person_name)}</span><small class="${item.due_date && item.due_date < todayKey ? 'bad' : ''}">${item.due_date ? `Jatuh tempo ${escapeHtml(item.due_date)}` : 'Tanpa jatuh tempo'}</small><strong>${rupiah(item.remaining)}</strong></div>`).join('')}</div>` : '<div class="empty">Belum ada piutang aktif.</div>'}</section>
  </div>`;
}

export function renderTransactions(container, { snapshot, currentMonth, onBind, onExportCsv }) {
  const rows = snapshot.transactions.filter((transaction) => transaction.tx_date.slice(0, 7) === currentMonth);
  container.innerHTML = `<div class="content"><section class="surface-panel ledger-panel full-ledger"><div class="ledger-toolbar"><div><span class="eyebrow">${new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(monthDate(currentMonth))}</span><small>${rows.length} catatan · ketuk untuk detail atau koreksi</small></div><div class="panel-actions"><button id="exportCsv" class="icon-btn" type="button" aria-label="Ekspor CSV" title="Ekspor CSV">${icon('download')}</button><button id="addTx2" class="primary" aria-label="Catat transaksi" title="Catat transaksi">${icon('plus')}<span>Catat</span></button></div></div><label class="ledger-search" for="transactionSearch">${icon('search')}<input id="transactionSearch" type="search" placeholder="Cari catatan, kategori, atau anggota" autocomplete="off"><span class="sr-only">Cari transaksi bulan terpilih</span></label><div class="ledger-filters" role="group" aria-label="Jenis transaksi"><button type="button" data-filter="all" aria-pressed="true">Semua</button><button type="button" data-filter="income" aria-pressed="false">Masuk</button><button type="button" data-filter="expense" aria-pressed="false">Belanja</button><button type="button" data-filter="savings" aria-pressed="false">Tabungan</button></div><p id="transactionResultCount" class="small muted" role="status" aria-live="polite"></p><div class="ledger-list"></div></section></div>`;
  container.querySelector('#exportCsv').onclick = () => onExportCsv(rows, currentMonth);
  let filter = 'all';
  const paint = () => {
    const query = container.querySelector('#transactionSearch').value.trim().toLocaleLowerCase('id-ID');
    const filtered = rows.filter((transaction) => (filter === 'all' || (filter === 'savings' ? Boolean(transaction.goal_id) : filter === 'expense' ? transaction.type === 'expense' && !transaction.goal_id : filter === 'income' ? transaction.type === 'income' && !transaction.goal_id : transaction.type === filter)) && [transaction.note, transaction.category_name, transaction.created_by_name, transaction.goal_name].some((value) => String(value || '').toLocaleLowerCase('id-ID').includes(query)));
    container.querySelector('.ledger-list').innerHTML = transactionRows(filtered);
    container.querySelector('#transactionResultCount').textContent = `${filtered.length} transaksi`;
    onBind();
  };
  container.querySelector('#transactionSearch').oninput = paint;
  container.querySelectorAll('[data-filter]').forEach((button) => {
    button.onclick = () => {
      filter = button.dataset.filter;
      container.querySelectorAll('[data-filter]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      paint();
    };
  });
  paint();
}

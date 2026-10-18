import { escapeHtml, icon } from '../ui.js';
import { goalProgress as calculateGoalProgress } from '../goal-math.js';

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
    <div class="goal-track-icon goal-tone-${index % 3}">${icon(goal.purpose === 'emergency' ? 'shield' : index === 0 ? 'target' : index === 1 ? 'vault' : 'spark')}</div>
    <div class="goal-track-copy"><div class="goal-track-head"><strong>${escapeHtml(goal.name)}</strong><span>${value}%</span></div><div class="goal-track-bar"><span style="width:${value}%"></span></div><small>${money(goal.current)} <em>/ ${money(goal.target)}</em></small></div>
  </div>`;
}

function transactionGlyph(transaction) {
  if (transaction.goal_id) return icon(transaction.type === 'income' ? 'down' : 'target');
  if (transaction.type === 'income') return icon('inflow');
  if (transaction.need) return icon('ledger');
  return icon('spark');
}

function transactionRows(rows) {
  if (!rows.length) return '<div class="empty">Belum ada transaksi di bulan ini.</div>';
  return rows.map((transaction) => {
    const isGoalWithdrawal = transaction.type === 'income' && transaction.goal_id;
    const label = isGoalWithdrawal ? `Pencairan ${transaction.goal_name || 'goal'}` : transaction.goal_id ? `Tabungan ${transaction.goal_name || 'goal'}` : transaction.category_name || (transaction.type === 'income' ? 'Pemasukan' : 'Tanpa kategori');
    const tone = isGoalWithdrawal ? 'is-inflow' : transaction.type === 'income' ? 'is-inflow' : transaction.goal_id ? 'is-goal' : 'is-outflow';
    return `<button type="button" class="ledger-row edit-tx" data-id="${escapeHtml(transaction.id)}" aria-label="Buka transaksi ${escapeHtml(transaction.note)}, ${money(transaction.amount)}">
      <span class="ledger-glyph ${tone}">${transactionGlyph(transaction)}</span>
      <span class="ledger-copy"><span class="ledger-main"><strong>${escapeHtml(transaction.note)}</strong><span class="ledger-amount ${isGoalWithdrawal || transaction.type === 'income' ? 'income' : transaction.goal_id ? 'savings' : 'expense'}">${transaction.type === 'expense' ? '-' : '+'}${money(transaction.amount)}</span></span><span class="ledger-meta"><span class="ledger-category">${escapeHtml(label)}</span><span class="ledger-member">${escapeHtml(transaction.created_by_name)}</span><time datetime="${escapeHtml(transaction.tx_date)}">${shortDate(transaction.tx_date)}</time></span></span>
    </button>`;
  }).join('');
}

function metric(label, value, note, tone = '') {
  return `<div class="rail-stat"><span>${label}</span><strong class="${tone}">${value}</strong><small>${note}</small></div>`;
}

function allocationToneLabel(tone) {
  return { good: 'Sesuai acuan', warn: 'Cek alokasi goals', bad: 'Di luar acuan', neutral: 'Butuh data' }[tone] || 'Monitor';
}

function allocationWidth(value, total) {
  return total ? Math.min(100, Math.max(0, Number(value || 0) / total * 100)) : 0;
}

function renderAllocation(health) {
  const items = [
    { key: 'needs', label: 'Kebutuhan', target: '<= 50%', className: 'needs', note: 'rumah, makan, tagihan' },
    { key: 'wants', label: 'Keinginan', target: '<= 30%', className: 'wants', note: 'lifestyle & fleksibel' },
    { key: 'savings', label: 'Goals', target: '>= 20%', className: 'savings', note: 'tabungan keluarga' },
    { key: 'unallocated', label: 'Belum dialokasikan', target: 'sisa', className: 'unallocated', note: 'buffer / keputusan berikutnya' },
  ];
  const basis = health.income ? 'dari pemasukan kerja' : 'belum ada pemasukan kerja';
  const visualTotal = Math.max(health.income, health.needs + health.wants + health.savings + Math.max(0, health.unallocated));
  return `<div class="allocation-stack" role="img" aria-label="Alokasi pemasukan: kebutuhan ${health.allocation.needs} persen, keinginan ${health.allocation.wants} persen, goals ${health.allocation.savings} persen, belum dialokasikan ${health.allocation.unallocated} persen">${items.map((item) => `<span class="allocation-segment ${item.className}" style="width:${health.income ? allocationWidth(health[item.key], visualTotal) : 0}%"></span>`).join('')}</div>
    <div class="allocation-legend">${items.map((item) => `<div class="allocation-item"><span class="allocation-dot ${item.className}"></span><span><strong>${item.label}</strong><small>${health.allocation[item.key]}% · ${item.target} · ${item.note}</small></span></div>`).join('')}</div>
    <p class="health-note">Panduan fleksibel ${basis}. Pencairan goal bukan pemasukan baru.</p>`;
}

function renderRunway(health, rupiah) {
  const months = health.runway.emergencyMonths;
  const title = months === null ? 'Belum terukur' : `${months.toFixed(1)} bulan`;
  const detail = months === null
    ? 'Atur kebutuhan esensial di Settings atau catat kebutuhan bulan penuh.'
    : `Operasional ${health.runway.operatingMonths.toFixed(1)} bln · dana darurat ${health.runway.emergencyMonths.toFixed(1)} bln · semua goals ${health.runway.totalMonths.toFixed(1)} bln.`;
  return `<div class="runway-card"><div class="runway-icon">${icon('shield')}</div><div class="runway-copy"><div class="runway-heading"><span class="health-label">Runway darurat</span><strong class="runway-value tone-${health.runway.tone}${months === null ? ' is-empty' : ''}">${title}</strong></div><small>${detail}</small><small>Basis ${rupiah(health.runway.baseline)} / bulan · ${escapeHtml(health.runway.baselineSource)}.</small></div></div>`;
}

export function renderDashboard(container, { snapshot, currentMonth, summary, health, monthName, rupiah, insightItems, onBind }) {
  const available = summary.availableBalance;
  const carried = summary.openingBalance;
  const balanceNote = carried > 0 ? `${rupiah(carried)} rollover` : carried < 0 ? `${rupiah(Math.abs(carried))} defisit terbawa` : 'Belum ada saldo bawaan';
  const insights = insightItems.slice(0, 2);
  const selectedGoals = snapshot.goals.slice(0, 3);

  container.innerHTML = `<div class="content dashboard-content">
    <section class="balance-hero">
      <div class="balance-hero-grid"></div>
      <div class="balance-hero-top"><div><span class="eyebrow">AVAILABLE BALANCE / ${escapeHtml(monthName)}</span><h2>Kas operasional</h2></div><div class="live-mark"><span></span>LIVE SYNC</div></div>
      <div class="balance-hero-amount" data-balance-tone="${available < 0 ? 'negative' : 'positive'}">${rupiah(available)}</div>
      <div class="balance-hero-sub"><span>${balanceNote}</span><span>${rupiah(summary.cashflow)} arus kas bulan ini</span></div>
      <div class="balance-hero-rail">
        ${metric('LIKUIDITAS TOTAL', rupiah(summary.totalLiquidity), 'kas + saldo goals')}
        ${metric('PEMASUKAN KERJA', rupiah(summary.income), 'pencairan tidak dihitung', 'is-inflow')}
        ${metric('BELANJA', rupiah(summary.spending), 'di luar setoran goals', 'is-outflow')}
        ${metric('SETORAN GOALS', rupiah(summary.goalSavings), 'keluar dari kas, jadi aset goals')}
        <div class="hero-sparkline"><span>6 BULAN</span><div class="cashflow-chart">${cashflowBars(snapshot.monthlySummary || [], currentMonth)}</div></div>
      </div>
    </section>

    <section class="surface-panel health-panel" aria-labelledby="healthTitle">
      <div class="panel-heading"><div><span class="eyebrow">FINANCIAL HEALTH</span><h3 id="healthTitle">Arah uang bulan ini</h3></div><span class="health-badge tone-${health.allocationTone}">${allocationToneLabel(health.allocationTone)}</span></div>
      <div class="health-grid"><div class="allocation-block"><div class="health-block-head"><strong>Alokasi 50 / 30 / 20</strong><span>${health.income ? rupiah(health.income) : 'Belum ada pemasukan kerja'}</span></div>${renderAllocation(health)}</div>${renderRunway(health, rupiah)}</div>
    </section>

    <div class="dashboard-grid">
      <section class="surface-panel insight-panel"><div class="panel-heading"><div><span class="eyebrow">SIGNALS</span><h3>Perlu perhatian</h3></div><span class="panel-count">${insights.length}</span></div>${insights.map((item) => `<div class="signal-row ${item.kind}"><span class="signal-dot"></span><p>${escapeHtml(item.text)}</p></div>`).join('')}</section>
      <section class="surface-panel goals-panel"><div class="panel-heading"><div><span class="eyebrow">LONG TERM</span><h3>Goals keluarga</h3></div><div class="panel-actions"><button type="button" class="text-action" data-quick-goal>${icon('plus')} Goal</button><button class="text-action" data-go="goals">Lihat semua ${icon('arrow')}</button></div></div><div class="goal-track-list">${selectedGoals.length ? selectedGoals.map(goalProgress).join('') : '<div class="empty">Belum ada goal.<button type="button" class="text-action" data-quick-goal style="margin-top:4px">' + icon('plus') + ' Tambah goal pertama</button></div>'}</div></section>
    </div>

    <section class="surface-panel ledger-panel"><div class="panel-heading"><div><span class="eyebrow">${escapeHtml(monthName)}</span><h3>Transaksi terbaru</h3></div><button class="text-action" data-go="transactions" aria-label="Lihat semua transaksi">Lihat semua ${icon('arrow')}</button></div><div class="ledger-list">${transactionRows(snapshot.transactions.filter((item) => item.tx_date.slice(0, 7) === currentMonth).slice(0, 6))}</div></section>
  </div>`;
  onBind();
}

export function renderTransactions(container, { snapshot, currentMonth, onBind, onExportCsv }) {
  const rows = snapshot.transactions.filter((transaction) => transaction.tx_date.slice(0, 7) === currentMonth);
  container.innerHTML = `<div class="content"><section class="surface-panel ledger-panel full-ledger"><div class="panel-heading"><div><span class="eyebrow">${new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(monthDate(currentMonth))}</span><h3>Transaksi</h3><small>${rows.length} catatan bulan ini · ketuk untuk detail / koreksi</small></div><div class="panel-actions"><button id="exportCsv" class="icon-btn" type="button" aria-label="Ekspor CSV" title="Ekspor CSV">${icon('download')}</button><button id="addTx2" class="primary">${icon('plus')}<span>Catat</span></button></div></div><label class="ledger-search" for="transactionSearch">${icon('search')}<input id="transactionSearch" type="search" placeholder="Cari catatan, kategori, atau anggota" autocomplete="off"><span class="sr-only">Cari transaksi bulan terpilih</span></label><div class="ledger-filters" role="group" aria-label="Jenis transaksi"><button type="button" data-filter="all" aria-pressed="true">Semua</button><button type="button" data-filter="income" aria-pressed="false">Masuk</button><button type="button" data-filter="expense" aria-pressed="false">Belanja</button><button type="button" data-filter="savings" aria-pressed="false">Tabungan</button></div><p id="transactionResultCount" class="small muted" role="status" aria-live="polite"></p><div class="ledger-list"></div></section></div>`;
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

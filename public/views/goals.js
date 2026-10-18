import { bindMoneyInputs, formatMoneyInput, numericAmount } from '../money.js';
import { escapeHtml, icon } from '../ui.js';
import { localDateValue, withPendingForm } from '../forms.js';
import { goalPlan, goalProgress, summarizeGoals } from '../goal-math.js';

const suggestions = ['Dana Darurat', 'Pendidikan Anak', 'Renovasi Rumah', 'Liburan Keluarga', 'Investasi'];
const dateFormatter = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

function goalIcon(name) {
  const value = String(name || '').toLowerCase();
  if (/darurat|kas|vault/.test(value)) return 'vault';
  if (/rumah|renovasi|mobil|kendaraan|pendidikan|investasi/.test(value)) return 'target';
  if (/umroh|haji|libur|wisata/.test(value)) return 'spark';
  return 'goals';
}

function goalProjection(goal, rupiah) {
  const { remaining, complete, overdue, months, perMonth } = goalPlan(goal);
  if (complete) return { label: 'Target sudah tercapai', tone: 'complete' };
  if (!goal.target_date) return { label: `Sisa ${rupiah(remaining)} · atur tanggal agar pace terukur`, tone: 'neutral' };
  const targetDate = new Date(`${goal.target_date}T00:00:00`);
  if (overdue) return { label: `Lewat target ${dateFormatter.format(targetDate)}. Tinjau ulang tanggal atau setoran.`, tone: 'late' };
  return { label: `${rupiah(perMonth)} / bulan · ${months} bulan tersisa`, tone: months <= 3 ? 'urgent' : 'neutral' };
}

function goalStatus(goal, projection, pct) {
  if (pct >= 100) return ['Tercapai', 'complete'];
  if (projection.tone === 'late') return ['Perlu ditinjau', 'late'];
  if (projection.tone === 'urgent') return ['Prioritas', 'urgent'];
  return ['Berjalan', 'active'];
}

export function renderGoals(container, { snapshot, currentMonth, rupiah, onSaveGoal, api, toast, refresh }) {
  const goals = snapshot.goals || [];
  const totals = summarizeGoals(goals);
  const { target: totalTarget, current: totalCurrent, remaining: totalRemaining } = totals;
  const totalProgress = goalProgress(totals.funded, totalTarget);
  const monthSavings = Number(snapshot.monthlySummary?.find((item) => item.month === currentMonth)?.goal_savings || 0);

  const renderGoal = (goal) => {
    const progress = goalProgress(goal.current, goal.target);
    const projection = goalProjection(goal, rupiah);
    const [status, tone] = goalStatus(goal, projection, progress);
    const remaining = Math.max(0, Number(goal.target) - Number(goal.current));
    return `<article class="goal-card" data-goal-id="${escapeHtml(goal.id)}">
      <div class="goal-card-head">
        <div class="goal-card-identity"><span class="goal-card-icon goal-tone-${tone}">${icon(goalIcon(goal.name))}</span><div><h3>${escapeHtml(goal.name)}</h3><p>${goal.target_date ? `Target ${escapeHtml(dateFormatter.format(new Date(`${goal.target_date}T00:00:00`)))}` : 'Tanpa tanggal target'}</p></div></div>
        <span class="goal-status goal-status-${tone}">${status}</span>
      </div>
      <div class="goal-card-meter"><div class="goal-card-meter-label"><span>Progress</span><strong>${progress}%</strong></div><div class="progress goal-progress"><span style="width:${progress}%"></span></div></div>
      <div class="goal-card-values"><div><span>Terkumpul</span><strong>${rupiah(goal.current)}</strong><small>dari ${rupiah(goal.target)}</small></div><div><span>Sisa kebutuhan</span><strong>${remaining ? rupiah(remaining) : 'Selesai'}</strong><small>saldo awal ${rupiah(goal.initial_balance)}</small></div></div>
      <p class="goal-projection goal-projection-${projection.tone}">${icon(projection.tone === 'complete' ? 'check' : projection.tone === 'late' ? 'warning' : 'up')}<span>${escapeHtml(projection.label)}</span></p>
      <div class="goal-card-actions"><button type="button" class="secondary goal-save" data-goal-id="${escapeHtml(goal.id)}">${icon('plus')}<span>Tabung</span></button><button type="button" class="icon-btn goal-edit" data-goal-id="${escapeHtml(goal.id)}" aria-label="Edit ${escapeHtml(goal.name)}" title="Edit goal">${icon('edit')}</button><button type="button" class="icon-btn danger-action goal-delete" data-goal-id="${escapeHtml(goal.id)}" aria-label="Hapus ${escapeHtml(goal.name)}" title="Hapus goal">${icon('trash')}</button></div>
    </article>`;
  };

  container.innerHTML = `<div class="content goals-content">
    <section class="surface-panel goals-overview" aria-labelledby="goalsTitle">
      <div class="goals-heading"><div><span class="eyebrow">LONG TERM / FAMILY PLAN</span><h2 id="goalsTitle">Goals keluarga</h2><p>Goal adalah pos tabungan terpisah: setoran mengurangi kas sekali, progresnya berjalan lintas bulan.</p></div><button id="addGoal" data-add-goal type="button" class="primary">${icon('plus')}<span>Tambah goal</span></button></div>
      <div class="goal-kpis"><div><span>Total terkumpul</span><strong>${rupiah(totalCurrent)}</strong><small>saldo awal + setoran tercatat</small></div><div><span>Total target</span><strong>${rupiah(totalTarget)}</strong><small>${goals.length} goal aktif</small></div><div><span>Progress portfolio</span><strong>${totalProgress}%</strong><small>${monthSavings ? `${rupiah(monthSavings)} ditabung bulan ini` : 'Belum ada setoran bulan ini'}</small></div></div>
    </section>
    <section class="goals-board" aria-label="Daftar goals"><div class="goals-board-head"><div><span class="eyebrow">PORTFOLIO</span><h3>Rencana yang sedang dikejar</h3></div><span class="goals-remaining">Sisa ${rupiah(totalRemaining)}</span></div><div class="goal-cards">${goals.length ? goals.map(renderGoal).join('') : `<div class="empty goal-empty"><span>Belum ada goal. Mulai dari dana darurat atau tujuan paling dekat.</span><button type="button" class="secondary" data-add-goal>${icon('plus')}<span>Buat goal pertama</span></button></div>`}</div></section>
    <dialog id="goalEditor" aria-labelledby="goalEditorTitle"><form id="goalForm" class="dialog-card form-stack" novalidate><div class="dialog-head"><div><span class="eyebrow">GOAL SETUP</span><h3 id="goalEditorTitle">Tambah goal</h3></div><button type="button" class="icon-btn" data-goal-close aria-label="Tutup dialog" title="Tutup">${icon('close')}</button></div><label for="goalName">Nama goal<input id="goalName" name="name" maxlength="60" placeholder="Dana darurat" required></label><div class="goal-suggestions"><span>Saran cepat</span>${suggestions.map((suggestion) => `<button type="button" class="suggestion-chip" data-suggestion="${escapeHtml(suggestion)}">${escapeHtml(suggestion)}</button>`).join('')}</div><div class="form-grid"><label for="goalTarget">Target nominal (Rp)<input id="goalTarget" name="target" class="money-input" inputmode="numeric" autocomplete="off" placeholder="50.000.000" required></label><label for="goalInitial">Saldo awal (Rp)<input id="goalInitial" name="initial_balance" class="money-input" inputmode="numeric" autocomplete="off" value="0" required><span class="field-help">Isi hanya saldo yang sudah ada sebelum dicatat di aplikasi.</span></label></div><label for="goalDate">Target tanggal (opsional)<input id="goalDate" name="target_date" type="date" min="${localDateValue()}"><span id="goalEstimate" class="field-help">Tambahkan tanggal untuk melihat kebutuhan setoran per bulan.</span></label><p id="goalFormMessage" class="form-message" role="status" aria-live="polite" hidden></p><div class="form-footer"><div></div><div class="actions"><button type="button" class="secondary" data-goal-close>Batal</button><button type="submit" class="primary">${icon('save')}<span>Simpan goal</span></button></div></div></form></dialog>
  </div>`;

  const dialog = container.querySelector('#goalEditor');
  const form = container.querySelector('#goalForm');
  const fields = { name: form.elements.name, target: form.elements.target, initial: form.elements.initial_balance, date: form.elements.target_date };
  let editingGoal = null;
  const message = (text = '', tone = 'muted') => { const box = form.querySelector('#goalFormMessage'); box.textContent = text; box.className = `form-message ${tone}`; box.hidden = !text; };
  const updateEstimate = () => {
    const readAmount = (field) => { try { return numericAmount(field.value); } catch { return 0; } };
    const target = readAmount(fields.target);
    const initial = readAmount(fields.initial);
    const contributed = editingGoal ? Number(editingGoal.contributed || 0) : 0;
    const currentProgress = initial + contributed;
    const remaining = Math.max(0, target - currentProgress);
    const hint = form.querySelector('#goalEstimate');
    if (!target) {
      hint.textContent = 'Masukkan target nominal untuk melihat perkiraan kebutuhan setoran.';
      return;
    }
    if (remaining === 0) {
      hint.textContent = 'Target sudah tertutup oleh saldo awal dan tabungan berjalan.';
      return;
    }
    const date = fields.date.value;
    if (!date) {
      hint.textContent = `Sisa kebutuhan ${rupiah(remaining)}. Tambahkan target tanggal untuk melihat pace per bulan.`;
      return;
    }
    const targetDate = new Date(`${date}T00:00:00`);
    const now = new Date();
    const months = Math.max(1, (targetDate.getFullYear() - now.getFullYear()) * 12 + targetDate.getMonth() - now.getMonth() + 1);
    hint.textContent = `Perkiraan setoran: ${rupiah(Math.ceil(remaining / months))} per bulan selama ${months} bulan.`;
  };
  const openEditor = (goal = null) => {
    editingGoal = goal;
    form.reset();
    message();
    form.querySelector('#goalEditorTitle').textContent = goal ? 'Edit goal' : 'Tambah goal';
    fields.name.value = goal?.name || '';
    fields.target.value = goal ? formatMoneyInput(goal.target) : '';
    fields.initial.value = goal ? formatMoneyInput(goal.initial_balance) : '0';
    fields.date.value = goal?.target_date || '';
    bindMoneyInputs(form);
    updateEstimate();
    dialog.showModal();
    fields.name.focus();
  };
  container.querySelectorAll('[data-add-goal]').forEach((button) => { button.onclick = () => openEditor(); });
  container.querySelectorAll('[data-goal-close]').forEach((button) => { button.onclick = () => dialog.close(); });
  container.querySelectorAll('[data-suggestion]').forEach((button) => { button.onclick = () => { fields.name.value = button.dataset.suggestion; fields.name.focus(); }; });
  [fields.target, fields.initial, fields.date].forEach((field) => {
    field.addEventListener('input', updateEstimate);
    field.addEventListener('change', updateEstimate);
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    message();
    try {
      const payload = { name: fields.name.value.trim(), target: numericAmount(fields.target.value), initial_balance: numericAmount(fields.initial.value), target_date: fields.date.value || null };
      await withPendingForm(form, () => api(editingGoal ? `/api/goals/${encodeURIComponent(editingGoal.id)}` : '/api/goals', { method: editingGoal ? 'PUT' : 'POST', body: JSON.stringify(payload) }));
      dialog.close();
      toast(editingGoal ? 'Goal diperbarui' : 'Goal baru ditambahkan');
      await refresh();
    } catch (error) { message(error.message, 'bad'); }
  });
  container.querySelectorAll('.goal-save').forEach((button) => { button.onclick = () => onSaveGoal(button.dataset.goalId); });
  container.querySelectorAll('.goal-edit').forEach((button) => { button.onclick = () => openEditor(goals.find((goal) => goal.id === button.dataset.goalId)); });
  container.querySelectorAll('.goal-delete').forEach((button) => {
    button.onclick = async () => {
      const goal = goals.find((item) => item.id === button.dataset.goalId);
      if (!goal || !confirm(`Hapus goal ${goal.name}? Goal dengan saldo atau riwayat setoran akan dilindungi.`)) return;
      try { await api(`/api/goals/${encodeURIComponent(goal.id)}`, { method: 'DELETE' }); toast('Goal dihapus'); await refresh(); } catch (error) { toast(error.message); }
    };
  });
}

import { bindMoneyInputs, formatMoneyInput, numericAmount } from '../money.js';
import { escapeHtml, icon } from '../ui.js';
import { localDateValue, withPendingForm } from '../forms.js';
import { goalPlan, goalProgress, summarizeGoals } from '../goal-math.js';
import { goalIconForName } from '../goal-icons.js';
import { confirmDialog } from '../dialogs.js';

const suggestions = ['Dana Darurat', 'Pendidikan Anak', 'Renovasi Rumah', 'Liburan Keluarga', 'Investasi'];
const dateFormatter = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

function goalStatus(plan) {
  if (plan.complete) return ['Tercapai', 'complete'];
  if (plan.overdue) return ['Lewat target', 'late'];
  if (plan.months && plan.months <= 3) return ['Prioritas', 'urgent'];
  return ['Berjalan', 'active'];
}

export function renderGoals(container, { snapshot, currentMonth, rupiah, onSaveGoal, onWithdrawGoal, api, toast, refresh }) {
  const goals = snapshot.goals || [];
  const totals = summarizeGoals(goals);
  const { target: totalTarget, current: totalCurrent } = totals;
  const totalProgress = goalProgress(totals.funded, totalTarget);
  const monthSavings = Number(snapshot.monthlySummary?.find((item) => item.month === currentMonth)?.goal_savings || 0);
  const monthLabel = new Intl.DateTimeFormat('id-ID', { month: 'short', year: 'numeric' }).format(new Date(`${currentMonth}-01T00:00:00`));

  const renderGoal = (goal) => {
    const progress = goalProgress(goal.current, goal.target);
    const plan = goalPlan(goal, snapshot.asOf || localDateValue());
    const [status, tone] = goalStatus(plan);
    const pace = plan.complete ? '' : plan.overdue ? 'Tinjau tanggal target' : plan.perMonth ? `${rupiah(plan.perMonth)}/bln` : '';
    const paceTitle = plan.perMonth && !plan.overdue ? `Perkiraan setoran per bulan, ${plan.months} bulan tersisa` : '';
    return `<article class="goal-card" data-goal-id="${escapeHtml(goal.id)}">
      <div class="goal-card-head">
        <div class="goal-card-identity"><span class="goal-card-icon">${icon(goalIconForName(goal.name, goal.purpose))}</span><div><h3>${escapeHtml(goal.name)}</h3>${(tone !== 'active' || goal.target_date) ? `<p class="goal-card-meta">${tone !== 'active' ? `<span class="goal-status goal-status-${tone}">${status}</span>` : ''}${goal.target_date ? `<span>Target ${escapeHtml(dateFormatter.format(new Date(`${goal.target_date}T00:00:00`)))}</span>` : ''}</p>` : ''}</div></div>
        <strong class="goal-card-percent" aria-label="Progres ${progress}%">${progress}%</strong>
      </div>
      <div class="goal-card-values"><strong>${rupiah(goal.current)}</strong><span>Target ${rupiah(goal.target)}</span></div>
      <div class="progress goal-progress" role="progressbar" aria-label="Progres ${escapeHtml(goal.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div>
      <div class="goal-card-foot"><div class="goal-card-plan"><span>${plan.complete ? 'Target tercapai' : `Sisa <strong>${rupiah(plan.remaining)}</strong>`}</span>${pace ? `<small class="goal-pace goal-pace-${tone}"${paceTitle ? ` title="${escapeHtml(paceTitle)}"` : ''}>${escapeHtml(pace)}</small>` : ''}</div><div class="goal-card-actions" role="group" aria-label="Aksi ${escapeHtml(goal.name)}"><button type="button" class="icon-btn goal-save" data-goal-id="${escapeHtml(goal.id)}" aria-label="Tambah setoran ke ${escapeHtml(goal.name)}" title="Tambah setoran">${icon('plus')}<span>Setor</span></button><details class="goal-more"><summary aria-label="Aksi lain untuk ${escapeHtml(goal.name)}" title="Aksi lain">${icon('ellipsis')}</summary><div class="goal-more-menu">${Number(goal.current) > 0 ? `<button type="button" class="goal-withdraw" data-goal-id="${escapeHtml(goal.id)}">${icon('down')}<span>Gunakan uang</span></button>` : ''}<button type="button" class="goal-edit" data-goal-id="${escapeHtml(goal.id)}">${icon('edit')}<span>Ubah tujuan</span></button><button type="button" class="danger-action goal-delete" data-goal-id="${escapeHtml(goal.id)}">${icon('trash')}<span>Hapus tujuan</span></button></div></details></div></div>
    </article>`;
  };

  container.innerHTML = `<div class="content goals-content">
    <section class="surface-panel goals-overview" aria-labelledby="goalsTitle">
      <div class="goals-heading"><div><h2 id="goalsTitle">Tujuan tabungan</h2><span class="goals-count">${totals.active} aktif${totals.completed ? ` · ${totals.completed} tercapai` : ''}</span></div><button id="addGoal" data-add-goal type="button" class="primary goal-add" aria-label="Tambah tujuan tabungan" title="Tambah tujuan">${icon('plus')}<span>Tujuan baru</span></button></div>
      <div class="goal-kpis"><div><span>Total tersimpan</span><strong>${rupiah(totalCurrent)}</strong><small>Dari target ${rupiah(totalTarget)}</small></div><div><span>Disisihkan ${escapeHtml(monthLabel)}</span><strong>${rupiah(monthSavings)}</strong><small>${totalProgress}% dari seluruh target</small></div></div>
    </section>
    <section class="goals-board" aria-label="Daftar goals"><div class="goal-cards">${goals.length ? goals.map(renderGoal).join('') : `<div class="empty goal-empty"><span>Belum ada goal. Mulai dari dana darurat atau tujuan paling dekat.</span><button type="button" class="secondary" data-add-goal>${icon('plus')}<span>Buat goal pertama</span></button></div>`}</div></section>
    <dialog id="goalEditor" aria-labelledby="goalEditorTitle"><form id="goalForm" class="dialog-card form-stack" novalidate><div class="dialog-head"><div><span class="eyebrow">GOAL SETUP</span><h3 id="goalEditorTitle">Tambah goal</h3></div><button type="button" class="icon-btn" data-goal-close aria-label="Tutup dialog" title="Tutup">${icon('close')}</button></div><label for="goalName">Nama goal<input id="goalName" name="name" maxlength="60" placeholder="Dana darurat" required></label><div class="goal-suggestions"><span>Saran cepat</span><div class="goal-suggestion-scroll" aria-label="Pilihan saran goal">${suggestions.map((suggestion) => `<button type="button" class="suggestion-chip" data-suggestion="${escapeHtml(suggestion)}">${escapeHtml(suggestion)}</button>`).join('')}</div></div><div class="form-grid"><label for="goalTarget">Target nominal (Rp)<input id="goalTarget" name="target" class="money-input" inputmode="numeric" autocomplete="off" placeholder="50.000.000" required></label><label for="goalInitial">Saldo awal (Rp)<input id="goalInitial" name="initial_balance" class="money-input" inputmode="numeric" autocomplete="off" value="0" required><span class="field-help">Isi hanya saldo yang sudah ada sebelum dicatat di aplikasi.</span></label></div><label for="goalPurpose">Karakter goal<select id="goalPurpose" name="purpose"><option value="general">Tujuan umum</option><option value="emergency">Dana darurat</option></select><span class="field-help">Dana darurat dipakai khusus untuk menghitung runway perlindungan keluarga.</span></label><label for="goalDate">Target tanggal (opsional)<input id="goalDate" name="target_date" type="date" min="${localDateValue()}"><span id="goalEstimate" class="field-help">Tambahkan tanggal untuk melihat kebutuhan setoran per bulan.</span></label><p id="goalFormMessage" class="form-message" role="status" aria-live="polite" hidden></p><div class="form-footer"><div></div><div class="actions"><button type="button" class="secondary" data-goal-close>Batal</button><button type="submit" class="primary">${icon('check')}<span>Simpan</span></button></div></div></form></dialog>
  </div>`;

  const dialog = container.querySelector('#goalEditor');
  const form = container.querySelector('#goalForm');
  const fields = { name: form.elements.name, target: form.elements.target, initial: form.elements.initial_balance, purpose: form.elements.purpose, date: form.elements.target_date };
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
    fields.purpose.value = goal?.purpose || 'general';
    fields.initial.disabled = Boolean(goal?.has_history);
    fields.date.removeAttribute('min');
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
      const payload = { name: fields.name.value.trim(), target: numericAmount(fields.target.value), initial_balance: numericAmount(fields.initial.value), purpose: fields.purpose.value, target_date: fields.date.value || null };
      await withPendingForm(form, () => api(editingGoal ? `/api/goals/${encodeURIComponent(editingGoal.id)}` : '/api/goals', { method: editingGoal ? 'PUT' : 'POST', body: JSON.stringify(payload) }));
      dialog.close();
      toast(editingGoal ? 'Goal diperbarui' : 'Goal baru ditambahkan');
      await refresh();
    } catch (error) { message(error.message, 'bad'); }
  });
  container.querySelectorAll('.goal-save').forEach((button) => { button.onclick = () => onSaveGoal(button.dataset.goalId); });
  container.querySelectorAll('.goal-withdraw').forEach((button) => { button.onclick = () => onWithdrawGoal(button.dataset.goalId); });
  container.querySelectorAll('.goal-edit').forEach((button) => { button.onclick = () => openEditor(goals.find((goal) => goal.id === button.dataset.goalId)); });
  container.querySelectorAll('.goal-delete').forEach((button) => {
    button.onclick = async () => {
      const goal = goals.find((item) => item.id === button.dataset.goalId);
      if (!goal || !(await confirmDialog({ title: `Hapus ${goal.name}?`, message: 'Goal bersaldo atau memiliki riwayat setoran tetap akan dilindungi.', confirmText: 'Hapus goal' }))) return;
      try { await api(`/api/goals/${encodeURIComponent(goal.id)}`, { method: 'DELETE' }); toast('Goal dihapus'); await refresh(); } catch (error) { toast(error.message); }
    };
  });
}

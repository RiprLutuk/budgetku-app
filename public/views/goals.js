import { bindMoneyInputs, numericAmount } from '../money.js';
import { escapeHtml, icon } from '../ui.js';

export function renderGoals(container, { snapshot, rupiah, pct, onSaveGoal, api, toast, refresh }) {
  container.innerHTML = `<div class="content"><section class="card" aria-labelledby="goalsSectionTitle">
    <div class="section-title">
      <div><h3 id="goalsSectionTitle">Target keluarga</h3><p>Setoran tabungan dicatat sebagai pengeluaran agar saldo bertambah konsisten.</p></div>
      <button id="saveGoals" class="primary" type="button">${icon('save')}<span>Simpan target</span></button>
    </div>
    <div class="goals-list">${snapshot.goals.map((goal) => {
      const progress = pct(goal.current, goal.target);
      return `<article class="goal-row" data-id="${goal.id}" aria-labelledby="goal-${goal.id}">
        <div class="goal-summary">
          <div><h4 id="goal-${goal.id}" class="goal-title">${escapeHtml(goal.name)}</h4><p class="small muted">${goal.target_date ? `Target tercapai ${escapeHtml(goal.target_date)}` : 'Tabungan tanpa batas waktu'}</p></div>
          <button type="button" class="secondary" data-save-goal="${goal.id}">${icon('plus')}<span>Tabung</span></button>
        </div>
        <div class="goal-total">
          <div><span class="small muted">Terkumpul</span><strong>${rupiah(goal.current)}</strong><span class="small muted"> / ${rupiah(goal.target)}</span></div>
          <span class="pill">${progress}%</span>
        </div>
        <div class="progress" role="progressbar" aria-label="Progres ${escapeHtml(goal.name)}" aria-valuenow="${Math.min(100, progress)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.min(100, progress)}%"></span></div>
        <p class="small muted">Saldo awal ${rupiah(goal.initial_balance)} + setoran tercatat ${rupiah(goal.contributed)}</p>
        <details class="goal-settings">
          <summary>${icon('settings')}<span>Sesuaikan target &amp; saldo awal</span></summary>
          <div class="goal-fields">
            <label>Nama target<input class="goal-name" maxlength="60" required value="${escapeHtml(goal.name)}"></label>
            <label>Target nominal (Rp)<input class="goal-target money-input" inputmode="numeric" autocomplete="off" value="${goal.target}" required></label>
            <label>Saldo awal (Rp)<input class="goal-initial money-input" inputmode="numeric" autocomplete="off" value="${goal.initial_balance}" required><span class="field-help">Khusus saldo sebelum menggunakan aplikasi.</span></label>
            <label>Tanggal target (opsional)<input class="goal-date" type="date" value="${escapeHtml(goal.target_date || '')}"></label>
          </div>
        </details>
      </article>`;
    }).join('')}</div>
  </section></div>`;
  bindMoneyInputs(container);
  container.querySelectorAll('[data-save-goal]').forEach((button) => {
    button.onclick = () => onSaveGoal(button.dataset.saveGoal);
  });
  const saveButton = container.querySelector('#saveGoals');
  saveButton.onclick = async () => {
    const rows = [...container.querySelectorAll('.goal-row')];
    for (const row of rows) {
      for (const field of row.querySelectorAll('input')) {
        if (!field.checkValidity()) {
          row.querySelector('details').open = true;
          field.reportValidity();
          return;
        }
      }
    }
    saveButton.disabled = true;
    try {
      const goals = rows.map((row) => ({
        id: row.dataset.id,
        name: row.querySelector('.goal-name').value.trim(),
        target: numericAmount(row.querySelector('.goal-target').value),
        initial_balance: numericAmount(row.querySelector('.goal-initial').value),
        target_date: row.querySelector('.goal-date').value || null,
      }));
      await api('/api/goals', { method: 'PUT', body: JSON.stringify({ goals }) });
      toast('Target keluarga tersimpan');
      await refresh();
    } catch (error) { toast(error.message); }
    finally { saveButton.disabled = false; }
  };
}

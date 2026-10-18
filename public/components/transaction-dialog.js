import { bindMoneyInputs, formatMoneyInput, numericAmount } from '../money.js';
import { formMessage, localDateValue, validateForm, withPendingForm } from '../forms.js';
import { closeSelects, escapeHtml, hydrateIcons, searchableSelect } from '../ui.js';

export function createTransactionDialog({ dialog, getSnapshot, save, onDelete, onSaved, getHistory }) {
  const form = dialog.querySelector('form');
  const feedback = form.querySelector('.form-message[role="status"]');
  const fields = form.elements;
  const title = dialog.querySelector('#txDialogTitle');
  const submitLabel = dialog.querySelector('#txSubmitLabel');
  const typeHint = dialog.querySelector('#txTypeHint');
  const deleteBtn = dialog.querySelector('#txDeleteBtn');
  const history = dialog.querySelector('#txHistory');
  let category;
  let goal;
  let paidBy;
  let data;
  let editingId = null;
  let editingVersion = 0;
  let amountHint = '';
  let suggestedGoalId = '';
  hydrateIcons(dialog);

  function categoryForGoal(goalId) {
    const selected = data?.goals.find((item) => item.id === goalId);
    if (!selected) return null;
    const matches = data.categories.filter((item) => item.name.trim().toLowerCase() === `target ${selected.name.trim().toLowerCase()}` || (selected.purpose === 'emergency' && item.name.trim().toLowerCase() === selected.name.trim().toLowerCase()));
    return matches.length === 1 ? matches[0] : null;
  }
  function isDiscretionaryCategory(categoryId) {
    const name = data?.categories.find((item) => item.id === categoryId)?.name || '';
    return /^(lifestyle|kopi\s*&\s*jajan kerja|hiburan|makan di luar)$/i.test(name.trim());
  }
  function syncHint() {
    const selected = data?.goals.find((item) => item.id === goal.value);
    const withdrawal = fields.type.value === 'income';
    const goalLabel = form.querySelector('label[for="txGoal"]');
    const noteLabel = form.querySelector('label[for="txNote"]');
    form.querySelector('#goalHint').textContent = selected
      ? withdrawal
        ? `Mencairkan ${selected.name} ke kas. Ini bukan pemasukan baru dan tidak mengubah pendapatan.`
        : `Menambah tabungan ${selected.name} dan mengurangi saldo kas sekali.${selected.id === suggestedGoalId && amountHint ? ` ${amountHint}` : ''}`
      : withdrawal ? 'Kosongkan jika ini pendapatan kerja. Pilih goal hanya saat mencairkan tabungan.' : '';
    goalLabel.textContent = withdrawal ? 'Cairkan dari tabungan (opsional)' : 'Simpan ke tabungan (opsional)';
    noteLabel.firstChild.textContent = selected && withdrawal ? 'Keterangan pencairan' : selected ? 'Keterangan setoran' : 'Nama / catatan';
    fields.note.placeholder = selected && withdrawal ? `Pencairan ${selected.name}` : selected ? `Tabungan ${selected.name}` : withdrawal ? 'Contoh: Gaji Oktober' : 'Contoh: Belanja bulanan';
    if (editingId) {
      typeHint.textContent = 'Periksa kembali perubahan sebelum menyimpan koreksi.';
      submitLabel.textContent = 'Simpan';
    } else if (selected && withdrawal) {
      typeHint.textContent = 'Uang tabungan dipindahkan kembali ke kas, bukan dicatat sebagai pendapatan baru.';
      submitLabel.textContent = 'Simpan';
    } else if (selected) {
      typeHint.textContent = 'Setoran ini mengurangi kas dan menambah saldo tabungan yang dipilih.';
      submitLabel.textContent = 'Simpan';
    } else {
      typeHint.textContent = withdrawal ? 'Catat uang yang benar-benar diterima; jangan pilih tabungan kecuali untuk pencairan.' : 'Catat uang yang benar-benar sudah dibelanjakan.';
      submitLabel.textContent = 'Simpan';
    }
  }
  function syncGoal() {
    const selected = data?.categories.find((item) => item.id === category.value);
    const matches = (data?.goals || []).filter((item) => selected?.name.trim().toLowerCase() === `target ${item.name.trim().toLowerCase()}` || (item.purpose === 'emergency' && selected?.name.trim().toLowerCase() === item.name.trim().toLowerCase()));
    goal.value = fields.type.value === 'expense' && matches.length === 1 ? matches[0].id : '';
    // New discretionary expenses should not silently inflate the essential
    // needs figure. The person can still change this checkbox when a purchase
    // is genuinely essential.
    if (!editingId && fields.type.value === 'expense' && !goal.value) fields.need.checked = !isDiscretionaryCategory(category.value);
    syncHint();
  }
  function syncType() {
    const income = fields.type.value === 'income';
    const transactionGrid = form.querySelector('.category-row').parentElement;
    form.querySelectorAll('[data-type]').forEach((button) => {
      const active = button.dataset.type === fields.type.value;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    form.querySelector('.category-row').classList.toggle('hidden', income);
    transactionGrid.classList.toggle('is-income', income);
    form.querySelector('.need-row').classList.toggle('hidden', income || Boolean(goal.value));
    category.setDisabled(income);
    goal.setDisabled(false);
    form.querySelector('#paidByLabel').textContent = income ? 'Diterima oleh' : 'Dibayar oleh';
    syncHint();
  }
  form.querySelectorAll('[data-type]').forEach((button) => {
    button.onclick = () => {
      fields.type.value = button.dataset.type;
      if (fields.type.value === 'expense') syncGoal();
      syncType();
    };
  });
  form.querySelectorAll('[data-dialog-close]').forEach((button) => { button.onclick = () => dialog.close(); });
  dialog.addEventListener('close', closeSelects);

  deleteBtn.onclick = async () => {
    if (!editingId || !confirm('Hapus transaksi ini dari pembukuan?')) return;
    try {
      await withPendingForm(form, async () => {
        await onDelete(editingId, editingVersion);
        dialog.close();
      });
    } catch (error) { formMessage(feedback, error.message, 'bad'); }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    fields.amount.setCustomValidity('');
    if (!validateForm(form)) return;
    formMessage(feedback);
    try {
      const amount = numericAmount(fields.amount.value);
      if (amount <= 0) {
        fields.amount.setCustomValidity('Nominal harus lebih dari nol.');
        fields.amount.reportValidity();
        return;
      }
      const income = fields.type.value === 'income';
      const selectedGoal = data?.goals.find((item) => item.id === goal.value);
      if (income && selectedGoal && amount > Number(selectedGoal.current || 0)) {
        fields.amount.setCustomValidity(`Pencairan melebihi saldo ${selectedGoal.name} yang tersedia.`);
        fields.amount.reportValidity();
        return;
      }
      fields.amount.setCustomValidity('');
      const payload = {
        type: fields.type.value,
        amount,
        note: fields.note.value.trim(),
        categoryId: income ? null : category.value || null,
        goalId: goal.value || null,
        date: fields.date.value,
        need: !income && !goal.value && fields.need.checked,
        paidBy: paidBy.value,
        source: fields.source.value,
        receiptUrl: fields.receiptUrl.value || null,
        externalRef: fields.externalRef.value || null,
        ...(editingId ? { version: editingVersion } : {}),
      };
      await withPendingForm(form, async () => {
        closeSelects();
        await save(payload, editingId);
        dialog.close();
        await onSaved(editingId);
      });
    } catch (error) { formMessage(feedback, error.message, 'bad'); }
  });

  return {
    open(prefill = {}) {
      data = getSnapshot();
      if (!data || dialog.open || form.getAttribute('aria-busy') === 'true') return;
      form.reset();
      formMessage(feedback);
      editingId = prefill.id || null;
      editingVersion = Number(prefill.version || 0);
      amountHint = prefill.amountHint || '';
      suggestedGoalId = prefill.goalId || prefill.goal_id || '';
      title.textContent = editingId ? 'Koreksi transaksi' : 'Catat transaksi';
      submitLabel.textContent = 'Simpan';
      deleteBtn.hidden = !editingId;
      fields.type.value = prefill.type || 'expense';
      fields.amount.value = formatMoneyInput(prefill.amount || '');
      fields.note.value = prefill.note || '';
      fields.date.value = prefill.date || prefill.tx_date || localDateValue();
      fields.date.max = localDateValue();
      fields.need.checked = prefill.need !== undefined ? Boolean(prefill.need) : true;
      fields.source.value = prefill.source || 'manual';
      fields.receiptUrl.value = prefill.receiptUrl || prefill.receipt_url || '';
      fields.externalRef.value = prefill.externalRef || prefill.external_ref || (editingId ? '' : `manual:${crypto.randomUUID()}`);
      category = searchableSelect(form.querySelector('#categorySelect'), {
        name: 'category', label: 'Kategori', inputId: 'txCategory',
        options: [{ value: '', label: 'Tanpa kategori' }, ...data.categories.map((item) => ({ value: item.id, label: item.name }))],
        value: prefill.categoryId ?? prefill.category_id ?? categoryForGoal(prefill.goalId ?? prefill.goal_id)?.id ?? data.categories[0]?.id ?? '',
        onChange: syncGoal,
      });
      goal = searchableSelect(form.querySelector('#goalSelect'), {
        name: 'goalId', label: 'Alokasi tabungan', inputId: 'txGoal', describedBy: 'goalHint',
        options: [{ value: '', label: 'Tidak dialokasikan' }, ...data.goals.map((item) => ({ value: item.id, label: `Tabungan ${item.name}` }))],
        value: prefill.goalId ?? prefill.goal_id ?? '',
        onChange(selected) {
          const matching = categoryForGoal(selected);
          if (matching && fields.type.value === 'expense') category.value = matching.id;
          syncType();
        },
      });
      paidBy = searchableSelect(form.querySelector('#paidBySelect'), {
        name: 'paidBy', label: 'Penanggung jawab', inputId: 'txPaidBy',
        options: [{ value: 'shared', label: 'Bersama' }, ...data.members.map((item) => ({ value: item.id, label: item.name }))],
        value: prefill.paidBy ?? prefill.paid_by ?? 'shared',
      });
      if (prefill.goalId === undefined && prefill.goal_id === undefined) syncGoal();
      history.hidden = !editingId;
      history.open = false;
      history.querySelector('[data-history]').textContent = '';
      history.ontoggle = async () => {
        if (!history.open || !editingId || !getHistory) return;
        const transactionId = editingId;
        const target = history.querySelector('[data-history]');
        target.textContent = 'Memuat riwayat...';
        try {
          const result = await getHistory(transactionId);
          if (editingId !== transactionId) return;
          target.innerHTML = result.history.length ? result.history.map((entry) => {
            const before = JSON.parse(entry.before_json);
            const after = entry.after_json ? JSON.parse(entry.after_json) : null;
            const format = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
            return `<p><strong>${escapeHtml(entry.actor_name || 'Pengguna')}</strong> · ${escapeHtml(new Date(entry.created_at).toLocaleString('id-ID'))}<br>${entry.action === 'delete' ? 'Dihapus' : 'Dikoreksi'}: ${escapeHtml(before.note)} (${format(before.amount)})${after ? ` → ${escapeHtml(after.note)} (${format(after.amount)})` : ''}</p>`;
          }).join('') : 'Belum ada koreksi.';
        } catch (error) { if (editingId === transactionId) target.textContent = error.message; }
      };
      syncType();
      bindMoneyInputs(form);
      dialog.showModal();
      fields.amount.focus();
    },
  };
}

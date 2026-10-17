import { bindMoneyInputs, formatMoneyInput, numericAmount } from '../money.js';
import { formMessage, localDateValue, validateForm, withPendingForm } from '../forms.js';
import { closeSelects, hydrateIcons, searchableSelect } from '../ui.js';

export function createTransactionDialog({ dialog, getSnapshot, save, onSaved }) {
  const form = dialog.querySelector('form');
  const feedback = form.querySelector('.form-message[role="status"]');
  const fields = form.elements;
  let category;
  let goal;
  let paidBy;
  let data;
  hydrateIcons(dialog);

  function categoryForGoal(goalId) {
    const selected = data.goals.find((item) => item.id === goalId);
    if (!selected) return null;
    const matches = data.categories.filter((item) => item.name.trim().toLowerCase() === `target ${selected.name.trim().toLowerCase()}`);
    return matches.length === 1 ? matches[0] : null;
  }
  function syncHint() {
    const selected = data.goals.find((item) => item.id === goal.value);
    form.querySelector('#goalHint').textContent = selected
      ? `Menambah tabungan ${selected.name} dan mengurangi cashflow satu kali.`
      : 'Pilih hanya jika transaksi ini adalah setoran tabungan.';
  }
  function syncGoal() {
    const selected = data.categories.find((item) => item.id === category.value);
    const matches = data.goals.filter((item) => selected?.name.trim().toLowerCase() === `target ${item.name.trim().toLowerCase()}`);
    goal.value = fields.type.value === 'expense' && matches.length === 1 ? matches[0].id : '';
    syncHint();
  }
  function syncType() {
    const income = fields.type.value === 'income';
    form.querySelectorAll('[data-type]').forEach((button) => {
      const active = button.dataset.type === fields.type.value;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    for (const selector of ['.category-row', '.goal-allocation-row', '.need-row']) {
      form.querySelector(selector).classList.toggle('hidden', income);
    }
    category.setDisabled(income);
    goal.setDisabled(income);
    form.querySelector('#paidByLabel').textContent = income ? 'Diterima oleh' : 'Dibayar oleh';
    if (income) goal.value = '';
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
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
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
      const payload = {
        type: fields.type.value,
        amount,
        note: fields.note.value.trim(),
        categoryId: income ? null : category.value || null,
        goalId: income ? null : goal.value || null,
        date: fields.date.value,
        need: !income && fields.need.checked,
        paidBy: paidBy.value,
        source: fields.source.value,
        receiptUrl: fields.receiptUrl.value || null,
        externalRef: fields.externalRef.value || null,
      };
      await withPendingForm(form, async () => {
        closeSelects();
        await save(payload);
        dialog.close();
        await onSaved();
      });
    } catch (error) { formMessage(feedback, error.message, 'bad'); }
  });

  return {
    open(prefill = {}) {
      data = getSnapshot();
      if (!data || dialog.open || form.getAttribute('aria-busy') === 'true') return;
      form.reset();
      formMessage(feedback);
      fields.type.value = prefill.type || 'expense';
      fields.amount.value = formatMoneyInput(prefill.amount || '');
      fields.note.value = prefill.note || '';
      fields.date.value = prefill.date || localDateValue();
      fields.source.value = prefill.source || 'manual';
      fields.receiptUrl.value = prefill.receiptUrl || '';
      fields.externalRef.value = prefill.externalRef || '';
      category = searchableSelect(form.querySelector('#categorySelect'), {
        name: 'category', label: 'Kategori', inputId: 'txCategory',
        options: [{ value: '', label: 'Tanpa kategori' }, ...data.categories.map((item) => ({ value: item.id, label: item.name }))],
        value: prefill.categoryId ?? categoryForGoal(prefill.goalId)?.id ?? data.categories[0]?.id ?? '',
        onChange: syncGoal,
      });
      goal = searchableSelect(form.querySelector('#goalSelect'), {
        name: 'goalId', label: 'Alokasi tabungan', inputId: 'txGoal', describedBy: 'goalHint',
        options: [{ value: '', label: 'Tidak dialokasikan' }, ...data.goals.map((item) => ({ value: item.id, label: `Tabungan ${item.name}` }))],
        value: prefill.goalId || '',
        onChange(selected) {
          const matching = categoryForGoal(selected);
          if (matching) category.value = matching.id;
          syncHint();
        },
      });
      paidBy = searchableSelect(form.querySelector('#paidBySelect'), {
        name: 'paidBy', label: 'Penanggung jawab', inputId: 'txPaidBy',
        options: [{ value: 'shared', label: 'Bersama' }, ...data.members.map((item) => ({ value: item.id, label: item.name }))],
        value: prefill.paidBy || 'shared',
      });
      if (prefill.goalId === undefined) syncGoal();
      syncType();
      bindMoneyInputs(form);
      dialog.showModal();
      fields.amount.focus();
    },
  };
}

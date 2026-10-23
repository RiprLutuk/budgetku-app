const pendingForms = new WeakSet();

export function localDateValue(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function formMessage(element, message = "", tone = "muted") {
  element.textContent = message;
  element.className = `form-message ${tone}`;
  element.hidden = !message;
}

export function validateForm(form) {
  for (const field of form.elements) {
    if (!field.willValidate || field.checkValidity()) continue;
    const details = field.closest("details");
    if (details) details.open = true;
    field.reportValidity();
    return false;
  }
  return true;
}

export async function withPendingForm(form, action) {
  if (pendingForms.has(form)) return;
  pendingForms.add(form);
  const controls = [...form.querySelectorAll("button, input, select, textarea")];
  const disabled = controls.map((control) => control.disabled);
  const submit = form.querySelector('button[type="submit"]:not([formnovalidate])');
  const submitHtml = submit?.innerHTML;
  form.setAttribute("aria-busy", "true");
  if (submit) {
    submit.classList.add("is-pending");
    submit.setAttribute("aria-label", "Menyimpan, mohon tunggu");
    submit.innerHTML = '<span class="button-spinner" aria-hidden="true"></span>Menyimpan…';
  }
  controls.forEach((control) => { control.disabled = true; });
  try {
    const result = await action();
    form.dispatchEvent(new Event("formsaved", { bubbles: true }));
    return result;
  } finally {
    controls.forEach((control, index) => { control.disabled = disabled[index]; });
    if (submit?.isConnected) {
      submit.classList.remove("is-pending");
      submit.removeAttribute("aria-label");
      submit.innerHTML = submitHtml;
    }
    form.removeAttribute("aria-busy");
    pendingForms.delete(form);
  }
}

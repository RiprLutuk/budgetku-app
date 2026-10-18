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
  form.setAttribute("aria-busy", "true");
  controls.forEach((control) => { control.disabled = true; });
  try {
    const result = await action();
    form.dispatchEvent(new Event("formsaved", { bubbles: true }));
    return result;
  } finally {
    controls.forEach((control, index) => { control.disabled = disabled[index]; });
    form.removeAttribute("aria-busy");
    pendingForms.delete(form);
  }
}

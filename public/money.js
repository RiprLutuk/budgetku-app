const formatter = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const invalidAmount = "Gunakan nominal rupiah bulat, misalnya 1.000.000.";

export function numericAmount(value) {
  const text = String(value ?? "").trim().replace(/^Rp\.?\s*/i, "");
  if (!text) return 0;
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(text)) throw new Error(invalidAmount);
  const amount = Number(text.replace(/\./g, ""));
  if (!Number.isSafeInteger(amount)) throw new Error("Nominal terlalu besar.");
  return amount;
}

export function formatMoneyInput(value) {
  if (value === "" || value === null || value === undefined) return "";
  return formatter.format(numericAmount(value));
}

function caretPosition(value, digits) {
  if (digits <= 0) return 0;
  let seen = 0;
  for (let index = 0; index < value.length; index++) {
    if (/\d/.test(value[index]) && ++seen === digits) return index + 1;
  }
  return value.length;
}

export function bindMoneyInputs(root = document) {
  root.querySelectorAll(".money-input").forEach((input) => {
    input.value = formatMoneyInput(input.value);
    input.setCustomValidity("");
    if (input.dataset.moneyBound) return;
    input.dataset.moneyBound = "true";
    input.addEventListener("beforeinput", (event) => {
      if (event.inputType === "insertText" && event.data && !/^\d+$/.test(event.data)) {
        event.preventDefault();
      }
    });
    input.addEventListener("paste", (event) => {
      if (!event.clipboardData) return;
      event.preventDefault();
      try {
        const amount = numericAmount(event.clipboardData.getData("text"));
        input.setRangeText(String(amount), input.selectionStart, input.selectionEnd, "end");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      } catch (error) {
        input.setCustomValidity(error.message);
        input.reportValidity();
      }
    });
    input.addEventListener("input", () => {
      const raw = input.value;
      const start = input.selectionStart ?? raw.length;
      const end = input.selectionEnd ?? start;
      const digits = raw.replace(/\./g, "");
      try {
        const formatted = formatMoneyInput(digits);
        const leadingZeros = digits.length - digits.replace(/^0+(?=\d)/, "").length;
        const startDigits = raw.slice(0, start).replace(/\D/g, "").length - leadingZeros;
        const endDigits = raw.slice(0, end).replace(/\D/g, "").length - leadingZeros;
        input.value = formatted;
        input.setCustomValidity("");
        input.setSelectionRange(caretPosition(formatted, startDigits), caretPosition(formatted, endDigits));
      } catch (error) {
        input.setCustomValidity(error.message);
      }
    });
  });
}

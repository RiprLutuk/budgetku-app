const storageKey = 'budgetku:amounts-privacy';
const maskedAmount = 'Rp \u2022\u2022\u2022\u2022\u2022\u2022';

export function maskCurrency(value) {
  return value.replace(/(?:[+-]\s*)?\bRp\.?[\s\u00a0]*[+-]?\d(?:[\d.,]*\d)?/gi, maskedAmount);
}

export function createPrivacyMode({ button, onChange = () => {} }) {
  let hidden = false;
  try {
    hidden = localStorage.getItem(storageKey) === 'hidden';
  } catch {}

  const textValues = new WeakMap();
  const attributeValues = new WeakMap();
  const inputTypes = new WeakMap();
  const attributes = ['title', 'aria-label', 'aria-valuetext'];
  let observer;

  function transform(value, previous) {
    const original = previous && value === previous.masked ? previous.original : value;
    return { original, masked: hidden ? maskCurrency(original) : original };
  }

  function apply() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let text;
    while ((text = walker.nextNode())) {
      if (text.parentElement?.closest('script, style, textarea, [contenteditable]')) continue;
      const next = transform(text.data, textValues.get(text));
      if (next.original !== next.masked) textValues.set(text, next);
      else textValues.delete(text);
      if (text.data !== next.masked) text.data = next.masked;
    }

    document.body.querySelectorAll('[title], [aria-label], [aria-valuetext]').forEach((element) => {
      const values = attributeValues.get(element) || new Map();
      attributes.forEach((attribute) => {
        const value = element.getAttribute(attribute);
        if (value === null) {
          values.delete(attribute);
          return;
        }
        const next = transform(value, values.get(attribute));
        if (next.original !== next.masked) values.set(attribute, next);
        else values.delete(attribute);
        if (value !== next.masked) element.setAttribute(attribute, next.masked);
      });
      if (values.size) attributeValues.set(element, values);
      else attributeValues.delete(element);
    });

    document.body.querySelectorAll('input.money-input').forEach((input) => {
      if (hidden && input.type === 'text') {
        inputTypes.set(input, input.type);
        input.type = 'password';
      } else if (!hidden && inputTypes.has(input)) {
        input.type = inputTypes.get(input);
        inputTypes.delete(input);
      }
    });
    observer?.takeRecords();
  }

  function setHidden(value, { remember = true } = {}) {
    hidden = value;
    if (remember) {
      try {
        localStorage.setItem(storageKey, hidden ? 'hidden' : 'visible');
      } catch {}
    }
    document.documentElement.dataset.amountsHidden = String(hidden);
    button.setAttribute('aria-pressed', String(hidden));
    button.setAttribute('aria-label', hidden ? 'Tampilkan nominal' : 'Sembunyikan nominal');
    button.title = hidden ? 'Tampilkan nominal' : 'Sembunyikan nominal';
    onChange(hidden);
    apply();
  }

  observer = new MutationObserver(apply);
  button.addEventListener('click', () => setHidden(!hidden));
  window.addEventListener('storage', (event) => {
    if (event.key === storageKey || event.key === null) setHidden(event.newValue === 'hidden', { remember: false });
  });
  setHidden(hidden, { remember: false });
  observer.observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    attributeFilter: attributes,
  });
  return { get hidden() { return hidden; } };
}

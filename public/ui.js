const paths = {
  overview: '<path d="M4 13.5a8 8 0 1 1 16 0"/><path d="M12 5v8l4 2"/><circle cx="12" cy="13" r="1"/>',
  ledger: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 8h8M8 12h5M8 16h3"/>',
  allocation: '<path d="M4 19V9m5 10V5m5 14v-7m5 7V3"/><path d="M3 19h18"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="m12 4 1.5 2.5L16 8"/>',
  family: '<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M3 20c.4-3 2-5 5-5s4.6 2 5 5M11 20c.4-3 2-5 5-5s4.6 2 5 5"/>',
  admin: '<path d="m12 3 7 3v5c0 4.6-4 8.2-7 10-3-1.8-7-5.4-7-10V6l7-3Z"/><path d="m9 12 2 2 4-5"/>',
  sliders: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="11" cy="18" r="2"/>',
  inflow: '<path d="M12 19V5m0 0L7 10m5-5 5 5"/><path d="M5 19h14"/>',
  vault: '<rect x="4" y="5" width="16" height="14" rx="3"/><path d="M8 5V3h8v2M8 12h8M12 9v6"/>',
  house: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10Z"/><path d="M9 21v-7h6v7"/>',
  car: '<path d="m5 16-1 4m16-4 1 4M3 13l2-6h14l2 6v5H3v-5Z"/><path d="M7 13h.01M17 13h.01M3 18h18"/>',
  kaaba: '<path d="m5 7 7-4 7 4v14l-7 3-7-3V7Z"/><path d="M5 10h14M5 15h14M9 5v17"/><path d="M12 11h.01"/>',
  food: '<path d="M8 3v8M5 3v5a3 3 0 0 0 6 0V3m-3 8v10M16 3v18m0-18c3 1 3 7 0 8h-2"/>',
  coffee: '<path d="M5 8h11v7a5 5 0 0 1-10 0V8Z"/><path d="M16 10h2a2 2 0 0 1 0 4h-2M6 3c0 1 1 1 1 2m3-2c0 1 1 1 1 2"/>',
  cart: '<path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 1.9-1.4L20 9H7"/><circle cx="10" cy="20" r="1"/><circle cx="17" cy="20" r="1"/>',
  book: '<path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H20v17H7.5A3.5 3.5 0 0 0 4 22V5.5Z"/><path d="M4 5.5A3.5 3.5 0 0 1 7.5 9H20M9 6h7"/>',
  wifi: '<path d="M3 9a14 14 0 0 1 18 0M6 13a9 9 0 0 1 12 0m-9 4a4 4 0 0 1 6 0"/><circle cx="12" cy="20" r="1" fill="currentColor" stroke="none"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z"/>',
  health: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.9-8.6a5.5 5.5 0 0 0-.1-7.8Z"/><path d="M7 12h2l1-2 2 5 1.5-3H17"/>',
  spark: '<path d="m12 3 1.5 6.5L20 12l-6.5 1.5L12 20l-1.5-6.5L4 12l6.5-2.5L12 3Z"/>',
  home: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  transactions: '<path d="M7 3v16m-4-4 4 4 4-4M17 21V5m-4 4 4-4 4 4"/>',
  budget: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 10h18M9 10v10"/>',
  goals: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z M9 7h6M9 11h6M9 15h3"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
  settings: '<path d="m9 3-.7 2.3-2.4.5-1.9 3 1.5 1.9-.3 2.5-1.2 2 1.8 3.1 2.4.4L10 21h4l1.8-2.3 2.4-.4 1.8-3.1-1.2-2-.3-2.5L20 8.8l-1.9-3-2.4-.5L15 3H9Z"/><circle cx="12" cy="12" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  today: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/><path d="M9 15h2v2H9z"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  trash: '<path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/>',
  edit: '<path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15v5Z"/>',
  logout: '<path d="M9 4H4v16h5m5-13 5 5-5 5m-5-5h14"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  more: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><path d="M17.5 14v7M14 17.5h7"/>',
  ellipsis: '<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2Z M7 3v6h10V3M7 21v-8h10v8"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z m-4 9 3 3 5-6"/>',
  warning: '<path d="m12 3 9 17H3L12 3Z"/><path d="M12 9v4m0 3h.01"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="m3 3 18 18M10.6 5.1 12 5c6 0 10 7 10 7a19 19 0 0 1-3 3.6M6.1 6.1A20 20 0 0 0 2 12s4 7 10 7a13 13 0 0 0 5.9-1.9M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  key: '<circle cx="8" cy="8" r="5"/><path d="m12 12 8 8m-4-4 3-3m-6 0 3-3"/>',
  down: '<path d="M7 7h10v10M17 7 7 17"/>',
  up: '<path d="M7 17V7h10M7 7l10 10"/>',
  wallet: '<path d="M20 7V4H6a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h15V7H6a3 3 0 0 1 0-6m15 10h-5v5h5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.6L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.6 4.6L20 16"/><path d="M20 20v-4h-4"/>',
  download: '<path d="M12 3v12m0 0 5-5m-5 5-5-5M4 21h16"/>',
};

export const icon = (name, className = '') => `<svg class="icon ${className}" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.plus}</svg>`;

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
})[character]);

export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((element) => { element.innerHTML = icon(element.dataset.icon); });
}

let openedSelect = null;
let selectId = 0;
export function closeSelects() { openedSelect?.close(); }
document.addEventListener('pointerdown', (event) => {
  if (openedSelect && !openedSelect.host.contains(event.target)) closeSelects();
});
const repositionOpenedSelect = () => openedSelect?.position();
window.addEventListener('resize', repositionOpenedSelect);
document.addEventListener('scroll', repositionOpenedSelect, true);
window.visualViewport?.addEventListener('resize', repositionOpenedSelect);
window.visualViewport?.addEventListener('scroll', repositionOpenedSelect);

export function searchableSelect(host, { name, label, options, value = '', inputId, describedBy, onChange = () => {} }) {
  host.selectControl?.destroy();
  const identifier = `suggest-${++selectId}`;
  host.classList.add('search-select');
  host.innerHTML = `<input type="hidden"><div class="search-select-control"><input type="text" class="search-select-input" role="combobox" autocomplete="off" spellcheck="false" aria-autocomplete="list" aria-expanded="false" aria-controls="${identifier}"><button type="button" class="select-toggle" tabindex="-1">${icon('chevron')}</button></div><div id="${identifier}" class="search-select-list" role="listbox" popover="manual"></div>`;
  const hidden = host.querySelector('input[type=hidden]');
  const input = host.querySelector('[role=combobox]');
  const toggle = host.querySelector('button');
  const list = host.querySelector('[role=listbox]');
  hidden.name = name;
  input.id = inputId || identifier + '-input';
  if (describedBy) input.setAttribute('aria-describedby', describedBy);
  input.setAttribute('aria-label', label);
  input.placeholder = `Cari ${label.toLowerCase()}...`;
  toggle.setAttribute('aria-label', `Pilihan ${label.toLowerCase()}`);
  list.setAttribute('aria-label', label);
  let items = options;
  let filtered = items;
  let selected = String(value);
  let activeIndex = -1;
  let opened = false;
  let listPointerActive = false;

  const display = () => {
    hidden.value = selected;
    input.value = items.find((item) => String(item.value) === selected)?.label || '';
  };
  const activate = (index) => {
    activeIndex = index;
    list.querySelectorAll('[role=option]').forEach((element, itemIndex) => element.classList.toggle('focused', itemIndex === index));
    if (index >= 0 && filtered[index]) {
      input.setAttribute('aria-activedescendant', `${identifier}-${index}`);
      const option = list.children[index];
      if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
      else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) {
        list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
      }
    } else input.removeAttribute('aria-activedescendant');
  };
  const choose = (item) => {
    selected = String(item.value);
    display();
    control.close();
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
    onChange(selected);
  };
  const paint = () => {
    list.replaceChildren();
    for (const [index, item] of filtered.entries()) {
      const option = document.createElement('div');
      option.className = 'search-select-option';
      option.setAttribute('role', 'option');
      option.id = `${identifier}-${index}`;
      option.setAttribute('aria-selected', String(String(item.value) === selected));
      option.textContent = item.label;
      option.addEventListener('click', () => choose(item));
      list.append(option);
    }
    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'search-select-empty';
      empty.setAttribute('role', 'status');
      empty.textContent = 'Tidak ada pilihan yang cocok';
      list.append(empty);
    }
    activate(filtered.length ? Math.max(0, filtered.findIndex((item) => String(item.value) === selected)) : -1);
  };
  const control = {
    host,
    get value() { return selected; },
    set value(next) { selected = String(next ?? ''); display(); },
    open() {
      if (input.disabled || opened) return;
      closeSelects();
      openedSelect = control;
      opened = true;
      filtered = items;
      host.classList.add('open');
      input.setAttribute('aria-expanded', 'true');
      paint();
      if (list.showPopover) list.showPopover();
      control.position();
      activate(activeIndex);
      if (window.matchMedia('(pointer: fine)').matches) input.select();
    },
    close() {
      if (!opened) return;
      opened = false;
      listPointerActive = false;
      if (list.hidePopover) list.hidePopover();
      host.classList.remove('open');
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      display();
      if (openedSelect === control) openedSelect = null;
    },
    position() {
      if (!host.isConnected) return control.close();
      const box = input.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop || 0;
      const viewportLeft = viewport?.offsetLeft || 0;
      const viewportHeight = viewport?.height || window.innerHeight;
      const viewportWidth = viewport?.width || window.innerWidth;
      const boxTop = box.top - viewportTop;
      const boxBottom = box.bottom - viewportTop;
      const availableBelow = viewportHeight - boxBottom - 12;
      const availableAbove = boxTop - 12;
      const above = availableBelow < 150 && availableAbove > availableBelow;
      const height = Math.max(0, Math.min(196, above ? availableAbove : availableBelow));
      const left = Math.max(viewportLeft + 8, Math.min(box.left, viewportLeft + viewportWidth - box.width - 8));
      Object.assign(list.style, {
        position: 'fixed', margin: '0', inset: 'auto',
        left: `${left}px`,
        width: `${box.width}px`, maxHeight: `${height}px`,
        top: above ? 'auto' : `${viewportTop + boxBottom + 5}px`,
        bottom: above ? `${window.innerHeight - (viewportTop + boxTop) + 5}px` : 'auto',
        zIndex: '1200',
      });
    },
    setDisabled(disabled) { input.disabled = disabled; hidden.disabled = disabled; toggle.disabled = disabled; if (disabled) control.close(); },
    destroy() { control.close(); delete host.selectControl; },
  };
  input.addEventListener('focus', () => control.open());
  input.addEventListener('click', () => control.open());
  input.addEventListener('input', () => {
    control.open();
    const query = input.value.normalize('NFKD').toLocaleLowerCase('id-ID').trim();
    filtered = items.filter((item) => item.label.normalize('NFKD').toLocaleLowerCase('id-ID').includes(query));
    paint();
    control.position();
  });
  input.addEventListener('keydown', (event) => {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      if (!opened && ['Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      control.open();
      if (!filtered.length) return;
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? filtered.length - 1 : Math.max(0, Math.min(filtered.length - 1, activeIndex + (event.key === 'ArrowDown' ? 1 : -1)));
      activate(next);
    } else if (event.key === 'Enter' && opened) {
      event.preventDefault();
      if (filtered[activeIndex]) choose(filtered[activeIndex]);
    } else if (event.key === 'Escape' && opened) {
      event.preventDefault();
      event.stopPropagation();
      control.close();
    } else if (event.key === 'Tab') control.close();
  });
  list.addEventListener('pointerdown', (event) => {
    listPointerActive = true;
    if (event.pointerType !== 'touch') event.preventDefault();
  });
  list.addEventListener('pointerup', () => { listPointerActive = false; });
  list.addEventListener('pointercancel', () => { listPointerActive = false; });
  input.addEventListener('blur', () => { if (!listPointerActive) control.close(); });
  toggle.addEventListener('pointerdown', (event) => event.preventDefault());
  toggle.addEventListener('click', () => { if (opened) control.close(); else { input.focus(); control.open(); } });
  host.selectControl = control;
  display();
  return control;
}

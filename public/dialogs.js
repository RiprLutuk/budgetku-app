import { icon } from './ui.js';

// A small, accessible SweetAlert-style confirmation surface. Keeping it local
// avoids a third-party CDN in a financial PWA while making every destructive
// decision look and behave consistently.
export function confirmDialog({ title = 'Lanjutkan?', message = '', confirmText = 'Lanjutkan', tone = 'danger' } = {}) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'confirm-dialog';
    dialog.setAttribute('aria-labelledby', 'confirmDialogTitle');
    dialog.innerHTML = `<div class="confirm-card"><span class="confirm-icon ${tone}">${icon(tone === 'danger' ? 'warning' : 'check')}</span><h2 id="confirmDialogTitle">${title}</h2><p>${message}</p><div class="confirm-actions"><button type="button" class="secondary" data-cancel>Batal</button><button type="button" class="${tone === 'danger' ? 'danger' : 'primary'}" data-confirm>${confirmText}</button></div></div>`;
    const close = (answer) => { dialog.close(); dialog.remove(); resolve(answer); };
    dialog.querySelector('[data-cancel]').onclick = () => close(false);
    dialog.querySelector('[data-confirm]').onclick = () => close(true);
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(false); }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
    dialog.querySelector('[data-cancel]').focus();
  });
}

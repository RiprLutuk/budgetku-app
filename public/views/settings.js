import { bindMoneyInputs, numericAmount } from '../money.js';
import { formMessage, validateForm, withPendingForm } from '../forms.js';
import { escapeHtml, icon } from '../ui.js';
import { confirmDialog } from '../dialogs.js';

function googleCard() {
  return `<section class="card integration-card" aria-labelledby="googleTitle">
    <div class="section-title"><div><h3 id="googleTitle">Integrasi Gmail</h3><p>Atur sekali, lalu setiap pengguna menghubungkan akun Gmail masing-masing.</p></div><span id="googleBadge" class="pill">Memuat</span></div>
    <form id="googleSettingsForm" class="form-stack" novalidate>
      <fieldset class="form-grid" disabled>
        <label>Client ID<input name="clientId" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="...apps.googleusercontent.com" required maxlength="512"></label>
        <label>Client secret<input name="clientSecret" type="password" autocomplete="new-password" placeholder="Masukkan client secret" maxlength="4096" aria-describedby="googleSecretHelp"><span id="googleSecretHelp" class="field-help">Secret tidak pernah ditampilkan ulang.</span></label>
        <label class="field-full">Redirect URI<div class="input-action"><input name="redirectUri" type="url" readonly aria-describedby="googleRedirectHelp"><button class="icon-btn" type="button" id="copyGoogleRedirect" aria-label="Salin Redirect URI" title="Salin Redirect URI">${icon('copy')}</button></div><span id="googleRedirectHelp" class="field-help">Daftarkan alamat ini pada OAuth client bertipe Web application di Google Cloud.</span></label>
      </fieldset>
      <div class="form-footer"><p id="googleSettingsStatus" class="form-message muted" role="status" aria-live="polite">Memuat konfigurasi...</p><div class="actions">
        <button class="secondary" id="retryGoogleSettings" type="button" hidden>Coba lagi</button>
        <button class="icon-btn danger-action" type="button" id="clearGoogleSettings" title="Hapus konfigurasi Gmail" aria-label="Hapus konfigurasi Gmail" disabled>${icon('trash')}</button>
        <button class="primary" type="submit" disabled>${icon('check')}<span>Simpan</span></button>
      </div></div>
    </form>
  </section>`;
}

export function renderSettings(container, { snapshot, user, api, toast, onWorkspaceSaved }) {
  const owner = snapshot.household.role === 'owner';
  container.innerHTML = `<div class="content"><div class="settings-grid">
    <section class="card" aria-labelledby="workspaceTitle">
      <div class="section-title"><div><h3 id="workspaceTitle">Workspace keluarga</h3><p>Satu ruang bersama untuk seluruh catatan keuangan.</p></div></div>
      <form id="workspaceSettingsForm" class="form-stack" novalidate>
        <fieldset class="form-stack" ${owner ? '' : 'disabled'}>
          <label>Nama workspace<input id="hhName" name="name" value="${escapeHtml(snapshot.household.name)}" maxlength="60" required></label>
          <label>Batas pengeluaran bulanan (Rp)<input id="monthlyLimit" name="monthlyLimit" class="money-input" inputmode="numeric" autocomplete="off" value="${snapshot.household.monthly_limit}" required><span class="field-help">Pengingat saat pengeluaran mendekati batas, bukan batas transaksi.</span></label>
          <label>Rencana pemasukan bulanan (Rp)<input name="plannedIncome" class="money-input" inputmode="numeric" autocomplete="off" value="${snapshot.household.planned_income || 0}"><span class="field-help">Dasar budget sebelum pemasukan bulan ini tercatat. Tidak menambah saldo kas.</span></label>
          <label>Saldo kas saat mulai memakai aplikasi (Rp)<input name="cashOpeningBalance" class="money-input" inputmode="numeric" autocomplete="off" value="${snapshot.household.cash_opening_balance || 0}"><span class="field-help">Masukkan sekali untuk mencerminkan uang yang sudah ada saat mulai mencatat. Bukan pemasukan bulan ini.</span></label>
          <label>Tanggal saldo awal<input name="cashOpeningDate" type="date" value="${escapeHtml(snapshot.household.cash_opening_date || '')}"><span class="field-help">Saldo awal berlaku mulai periode ini agar laporan sebelum tanggal tersebut tidak ikut berubah.</span></label>
          <label>Kebutuhan esensial per bulan (Rp)<input name="essentialMonthly" class="money-input" inputmode="numeric" autocomplete="off" value="${snapshot.household.essential_monthly || 0}"><span class="field-help">Estimasi sendiri untuk runway kas + dana darurat. Nilai 0 memakai rata-rata kebutuhan bulan terdahulu yang tercatat, tanpa menebak bulan kosong.</span></label>
        </fieldset>
        <div class="form-footer"><p class="form-message muted" role="status" aria-live="polite">${owner ? '' : 'Hanya pemilik workspace yang dapat mengubah pengaturan.'}</p><button class="primary" type="submit" ${owner ? '' : 'disabled'}>${icon('check')}<span>Simpan</span></button></div>
      </form>
    </section>
    <section class="card" aria-labelledby="securityTitle">
      <div class="section-title"><div><h3 id="securityTitle">Keamanan akun</h3><p>Gunakan password yang berbeda dari akun lainnya.</p></div></div>
      <form id="changePasswordForm" class="form-stack" novalidate>
        <label>Password saat ini<input name="currentPassword" type="password" autocomplete="current-password" required></label>
        <div class="form-grid">
          <label>Password baru<input name="nextPassword" type="password" autocomplete="new-password" minlength="12" maxlength="1024" placeholder="Minimal 12 karakter" required></label>
          <label>Ulangi password baru<input name="confirmPassword" type="password" autocomplete="new-password" required></label>
        </div>
        <div class="form-footer"><p class="form-message muted" role="status" aria-live="polite"></p><button class="secondary" type="submit">${icon('key')}<span>Ganti password</span></button></div>
      </form>
    </section>
    ${user.is_superadmin ? googleCard() : ''}
  </div></div>`;
  bindMoneyInputs(container);

  const workspace = container.querySelector('#workspaceSettingsForm');
  workspace.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!owner || !validateForm(workspace)) return;
    const message = workspace.querySelector('[role=status]');
    try {
      const data = new FormData(workspace);
      const payload = { name: data.get('name').trim(), monthlyLimit: numericAmount(data.get('monthlyLimit')), plannedIncome: numericAmount(data.get('plannedIncome') || '0'), cashOpeningBalance: numericAmount(data.get('cashOpeningBalance') || '0'), cashOpeningDate: data.get('cashOpeningDate') || null, essentialMonthly: numericAmount(data.get('essentialMonthly') || '0') };
      await withPendingForm(workspace, async () => {
        await api('/api/household', { method: 'PUT', body: JSON.stringify(payload) });
        toast('Pengaturan workspace tersimpan');
        await onWorkspaceSaved();
      });
    } catch (error) { formMessage(message, error.message, 'bad'); }
  });

  const password = container.querySelector('#changePasswordForm');
  const confirmPassword = password.elements.confirmPassword;
  const checkConfirmation = () => confirmPassword.setCustomValidity(confirmPassword.value === password.elements.nextPassword.value ? '' : 'Password baru belum sama.');
  password.addEventListener('input', checkConfirmation);
  password.addEventListener('submit', async (event) => {
    event.preventDefault();
    checkConfirmation();
    if (!validateForm(password)) return;
    const data = new FormData(password);
    const message = password.querySelector('[role=status]');
    try {
      await withPendingForm(password, async () => {
        await api('/api/account/password', { method: 'PUT', body: JSON.stringify({ currentPassword: data.get('currentPassword'), password: data.get('nextPassword') }) });
        password.reset();
        confirmPassword.setCustomValidity('');
        formMessage(message, 'Password berhasil diganti.', 'good');
        toast('Password berhasil diganti');
      });
    } catch (error) { formMessage(message, error.message, 'bad'); }
  });
  if (user.is_superadmin) return mountGoogleSettings(container, { api, toast });
}

function mountGoogleSettings(container, { api, toast }) {
  const form = container.querySelector('#googleSettingsForm');
  const fields = form.querySelector('fieldset');
  const message = form.querySelector('[role=status]');
  const badge = container.querySelector('#googleBadge');
  const save = form.querySelector('[type=submit]');
  const clear = form.querySelector('#clearGoogleSettings');
  const retry = form.querySelector('#retryGoogleSettings');
  const callback = new URL('/auth/google/callback', location.href).href;
  let savedClientId = '';
  let hasSecret = false;
  let ready = false;
  form.elements.redirectUri.value = callback;
  const updateRequirements = () => {
    form.elements.clientSecret.required = !hasSecret || form.elements.clientId.value.trim() !== savedClientId;
    form.elements.clientSecret.placeholder = hasSecret ? 'Kosongkan jika tidak diganti' : 'Masukkan client secret';
    clear.disabled = !hasSecret;
  };
  const load = async () => {
    ready = false;
    fields.disabled = save.disabled = true;
    clear.disabled = true;
    retry.hidden = true;
    formMessage(message, 'Memuat konfigurasi...');
    try {
      const settings = await api('/api/admin/integrations/google');
      if (!form.isConnected) return;
      savedClientId = settings.clientId || '';
      hasSecret = settings.clientSecretSet;
      form.elements.clientId.value = savedClientId;
      badge.textContent = settings.configured ? 'Siap dihubungkan' : 'Belum diatur';
      formMessage(message, settings.configured ? 'Hubungkan akun Gmail dari halaman Nota & Gmail.' : 'Isi kredensial untuk mengaktifkan impor Gmail.');
      ready = true;
      fields.disabled = save.disabled = false;
      updateRequirements();
    } catch (error) {
      if (!form.isConnected) return;
      badge.textContent = 'Gagal dimuat';
      formMessage(message, error.message, 'bad');
      retry.hidden = false;
    }
  };
  retry.onclick = load;
  form.elements.clientId.addEventListener('input', updateRequirements);
  form.querySelector('#copyGoogleRedirect').onclick = async () => {
    try { await navigator.clipboard.writeText(callback); toast('Redirect URI disalin'); }
    catch { form.elements.redirectUri.select(); toast('Pilih salin untuk menyalin Redirect URI'); }
  };
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!ready || !validateForm(form)) return;
    const payload = Object.fromEntries(new FormData(form));
    try {
      await withPendingForm(form, async () => {
        const result = await api('/api/admin/integrations/google', { method: 'PUT', body: JSON.stringify(payload) });
        savedClientId = payload.clientId.trim();
        hasSecret = true;
        form.elements.clientSecret.value = '';
        badge.textContent = 'Siap dihubungkan';
        formMessage(message, result.connectionsReset ? 'Tersimpan. Hubungkan ulang akun Gmail dari Nota & Gmail.' : 'Konfigurasi tersimpan.', 'good');
        toast('Integrasi Gmail tersimpan');
      });
      updateRequirements();
    } catch (error) { formMessage(message, error.message, 'bad'); }
  });
  clear.onclick = async () => {
    if (!ready || !(await confirmDialog({ title: 'Hapus integrasi Gmail?', message: 'Akun Gmail seluruh pengguna akan diputuskan dan impor dinonaktifkan.', confirmText: 'Hapus integrasi' }))) return;
    try {
      await withPendingForm(form, async () => {
        await api('/api/admin/integrations/google', { method: 'DELETE' });
        form.reset();
        form.elements.redirectUri.value = callback;
        savedClientId = '';
        hasSecret = false;
        badge.textContent = 'Belum diatur';
        formMessage(message, 'Konfigurasi dihapus. Impor Gmail dinonaktifkan.');
        toast('Konfigurasi Gmail dihapus');
      });
      updateRequirements();
    } catch (error) { formMessage(message, error.message, 'bad'); }
  };
  return load();
}

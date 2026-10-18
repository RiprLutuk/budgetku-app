import { bindMoneyInputs, numericAmount } from "./money.js";
import { closeSelects, icon } from "./ui.js";
import { localDateValue, validateForm, withPendingForm } from "./forms.js";
import { renderGoals as renderGoalsView } from "./views/goals.js";
import { renderSettings as renderSettingsView } from "./views/settings.js";
import { createTransactionDialog } from "./components/transaction-dialog.js";
import { financialHealth, summarizeCashflow } from "./cashflow.js";
import { renderDashboard as renderDashboardView, renderTransactions as renderTransactionsView } from "./views/dashboard.js";

let me = null,
  txDialog = null,
  snapshot = null,
  currentView = "dashboard",
  activeHouseholdId = "",
  pollTimer = null,
  eventSource = null,
  snapshotRequestId = 0,
  currentMonth = localDateValue().slice(0, 7),
  followingCurrentMonth = true,
  pendingJoin = new URLSearchParams(location.search).get("join"),
  editingUserId = null;
const app = document.querySelector("#app"),
  authScreen = document.querySelector("#authScreen"),
  shell = document.querySelector("#shell"),
  pageTitle = document.querySelector("#pageTitle");
const monthControl = document.querySelector("#monthControl"),
  monthPicker = document.querySelector("#monthPickerBtn"),
  moreDialog = document.querySelector("#moreDialog"),
  moreButton = document.querySelector(".nav-more");
const rupiah = (n) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(n || 0));
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>'"]/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        c
      ],
  );
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
function isEditing() {
  const active = document.activeElement;
  return (
    !["dashboard", "transactions", "budget", "goals", "users"].includes(currentView) ||
    Boolean(document.querySelector("dialog[open]")) ||
    Boolean(app.querySelector('.budget-content[data-editing="true"]')) ||
    Boolean(app.querySelector(".goal-settings[open]")) ||
    Boolean(document.querySelector(".search-select.open")) ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(active?.tagName)
  );
}
function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.append(el);
  setTimeout(() => el.remove(), 2500);
}
async function api(url, opt = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(opt.headers || {}),
  };
  if (activeHouseholdId) headers["x-household-id"] = activeHouseholdId;
  const r = await fetch(url, { ...opt, headers });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}
async function boot() {
  try {
    me = await api("/api/me");
    activeHouseholdId = me.households[0]?.id || "";
    if (pendingJoin) {
      const j = await api(
        `/api/invites/${encodeURIComponent(pendingJoin)}/join`,
        { method: "POST" },
      );
      activeHouseholdId = j.householdId;
      pendingJoin = null;
      history.replaceState({}, "", location.pathname);
      me = await api("/api/me");
      toast("Berhasil join household");
    }
    await loadSnapshot();
    showApp();
  } catch (e) {
    showAuth();
  }
}
function showAuth() {
  shell.classList.add("hidden");
  authScreen.classList.remove("hidden");
  renderAuth();
}
function renderAuth() {
  authScreen.innerHTML = `
    <section class="auth-card" aria-labelledby="loginTitle">
      <div class="auth-brand">
        <img src="/favicon.svg" alt="" class="auth-logo" width="32" height="32">
        <div class="auth-brand-copy">
          <span class="auth-brand-name">BudgetKu</span>
          <span class="auth-brand-caption">Family money tracker</span>
        </div>
      </div>
      <header class="auth-heading">
        <h1 id="loginTitle">Masuk ke akunmu</h1>
        <p>Lanjutkan ke dashboard keuangan keluarga.</p>
      </header>
      <form id="loginForm" class="auth-form" aria-labelledby="loginTitle">
        <label for="loginEmail">Email
          <input id="loginEmail" name="email" type="email" inputmode="email" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="nama@email.com" required>
        </label>
        <label for="loginPassword">Password
          <input id="loginPassword" name="password" type="password" autocomplete="current-password" placeholder="Masukkan password" required>
        </label>
        <p id="authError" class="auth-error" role="alert" hidden></p>
        <button type="submit" class="primary auth-submit"><span class="auth-submit-label">Masuk</span>${icon("arrow")}</button>
      </form>
    </section>`;
  const form = authScreen.querySelector("#loginForm");
  const errorBox = form.querySelector("#authError");
  const submitLabel = form.querySelector(".auth-submit-label");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (form.getAttribute("aria-busy") === "true") return;
    const credentials = Object.fromEntries(new FormData(form));
    errorBox.hidden = true;
    errorBox.textContent = "";
    try {
      await withPendingForm(form, async () => {
        submitLabel.textContent = "Memproses...";
        try {
          await api("/api/auth/login", {
            method: "POST",
            body: JSON.stringify(credentials),
          });
          await boot();
        } finally {
          submitLabel.textContent = "Masuk";
        }
      });
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    }
  });
}
async function refreshSnapshot(background = false) {
  const householdId = activeHouseholdId;
  const requestId = ++snapshotRequestId;
  const next = await api(`/api/snapshot?month=${encodeURIComponent(currentMonth)}`);
  if (householdId !== activeHouseholdId || requestId !== snapshotRequestId) return;
  snapshot = next;
  if (background && isEditing()) return;
  renderChrome();
  render();
}
async function loadSnapshot() {
  await refreshSnapshot();
  setupRealtime();
}
function setupRealtime() {
  if (pollTimer) clearInterval(pollTimer);
  if (eventSource) eventSource.close();
  if (!activeHouseholdId) return;
  const householdId = activeHouseholdId;
  const refresh = async () => {
    if (householdId !== activeHouseholdId) return;
    try {
      await refreshSnapshot(true);
    } catch {}
  };
  if ("EventSource" in window && snapshot.realtime !== "polling") {
    const source = new EventSource(`/api/events?householdId=${encodeURIComponent(householdId)}`);
    eventSource = source;
    source.addEventListener("ready", refresh);
    source.addEventListener("changed", refresh);
    source.onerror = () => {
      source.close();
      if (eventSource === source) eventSource = null;
    };
  }
  pollTimer = setInterval(async () => {
    if (document.hidden) return;
    await refresh();
  }, 8000);
}
document.addEventListener("visibilitychange", async () => {
  if (!document.hidden && activeHouseholdId && me) {
    try {
      await refreshSnapshot(true);
      if (!eventSource) setupRealtime();
    } catch {}
  }
});
function showApp() {
  authScreen.classList.add("hidden");
  shell.classList.remove("hidden");
  renderChrome();
  render();
}
function shiftMonth(offset) {
  const [year, month] = currentMonth.split("-").map(Number);
  const next = new Date(year, month - 1 + offset, 1);
  currentMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
  followingCurrentMonth = currentMonth === localDateValue().slice(0, 7);
  renderChrome();
  render();
  refreshSnapshot().catch((error) => toast(error.message));
}
function resetMonth() {
  followingCurrentMonth = true;
  currentMonth = localDateValue().slice(0, 7);
  renderChrome();
  render();
}
function renderChrome() {
  if (!me || !snapshot) return;
  if (followingCurrentMonth) currentMonth = localDateValue().slice(0, 7);
  const household = me.households.find((h) => h.id === snapshot.household.id);
  if (household) household.name = snapshot.household.name;
  document.querySelector("#monthLabel").textContent = new Intl.DateTimeFormat(
    "id-ID",
    { month: "long", year: "numeric" },
  ).format(new Date(`${currentMonth}-01T00:00:00`));
  document.querySelector("#compactMonthLabel").textContent = new Intl.DateTimeFormat(
    "id-ID", { month: "short", year: "numeric" },
  ).format(new Date(`${currentMonth}-01T00:00:00`));
  monthPicker.setAttribute("aria-label", `Pilih bulan, ${document.querySelector("#monthLabel").textContent}`);
  document.querySelector("#currentMonthBtn").hidden = currentMonth === localDateValue().slice(0, 7);
  document.querySelectorAll(".admin-only").forEach((el) => {
    el.classList.toggle("hidden", !me.user.is_superadmin);
  });
  const account = `<div class="side-user-meta"><b>${esc(me.user.name)}</b><span class="small muted">${esc(me.user.email)}</span>${me.user.is_superadmin ? '<span class="pill badge-admin">Superadmin</span>' : ""}</div><button type="button" data-logout class="account-logout" aria-label="Keluar dari akun" title="Keluar">${icon("logout")}</button>`;
  document.querySelector("#userMini").innerHTML = account;
  document.querySelector("#moreUser").innerHTML = account;
  document.querySelectorAll("[data-logout]").forEach((button) => {
    button.onclick = async () => {
      button.disabled = true;
      try {
        await api("/api/auth/logout", { method: "POST" });
        location.reload();
      } catch (error) {
        button.disabled = false;
        toast(error.message);
      }
    };
  });
}
const monthTx = () => snapshot.transactions.filter((transaction) => transaction.tx_date.slice(0, 7) === currentMonth);
const monthCashflow = () => summarizeCashflow(snapshot.monthlySummary, currentMonth, snapshot.transactions);
function render() {
  document
    .querySelectorAll(".nav")
    .forEach((button) => {
      const active = button.dataset.view === currentView;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  moreButton.classList.toggle("active", ["receipts", "family", "users", "settings"].includes(currentView));
  monthControl.hidden = !["dashboard", "transactions", "budget"].includes(currentView);
  pageTitle.textContent = {
    dashboard: "Dashboard",
    transactions: "Transaksi",
    budget: "Auto Budget",
    goals: "Goals",
    receipts: "Nota & Gmail",
    family: "Family",
    users: "Kelola User",
    settings: "Settings",
  }[currentView];
  if (currentView === "dashboard") renderDashboard();
  if (currentView === "transactions") renderTransactions();
  if (currentView === "budget") renderBudget();
  if (currentView === "goals") renderGoals();
  if (currentView === "receipts") renderReceipts();
  if (currentView === "family") renderFamily();
  if (currentView === "users") renderUsers();
  if (currentView === "settings") renderSettings();
}
function insightItems(summary = monthCashflow()) {
  const inc = summary.income,
    exp = summary.expense,
    need = summary.needsExpense,
    spending = exp - summary.goalSavings,
    wants = Math.max(0, spending - need),
    saveAmt = summary.goalSavings,
    health = financialHealth(summary, snapshot.monthlySummary, currentMonth),
    out = [];
  if (exp > snapshot.household.monthly_limit)
    out.push({
      kind: "bad",
      text: `Pengeluaran ${rupiah(exp)} sudah di atas guardrail ${rupiah(snapshot.household.monthly_limit)}. Tahan belanja discretionary sampai arus kas kembali aman.`,
    });
  else if (exp > snapshot.household.monthly_limit * 0.8)
    out.push({
      kind: "warn",
      text: `Pengeluaran sudah ${pct(exp, snapshot.household.monthly_limit)}% dari guardrail bulanan. Sisa ruang ${rupiah(Math.max(0, snapshot.household.monthly_limit - exp))}.`,
    });
  if (inc > 0 && saveAmt / inc < 0.2)
    out.push({
      kind: "warn",
      text: `Setoran goals baru ${Math.max(0, pct(saveAmt, inc))}% dari pemasukan. Lindungi alokasi tabungan sebelum lifestyle bertambah.`,
    });
  if (inc > 0 && health.allocation.needs > 50)
    out.push({
      kind: "bad",
      text: `Kebutuhan menyerap ${health.allocation.needs}% pemasukan, di atas benchmark 50%. Cari pos tetap yang bisa dinegosiasi atau diturunkan.`,
    });
  if (inc > 0 && health.allocation.wants > 30)
    out.push({
      kind: "warn",
      text: `Keinginan mengambil ${health.allocation.wants}% pemasukan, di atas benchmark 30%. Jadikan ini area pertama untuk dikendalikan.`,
    });
  if (health.runway.tone === "bad")
    out.push({
      kind: "warn",
      text: `Ketahanan kas baru sekitar ${health.runway.months.toFixed(1)} bulan kebutuhan. Prioritaskan buffer sebelum menambah komitmen baru.`,
    });
  if (spending > 0 && wants / spending > 0.2)
    out.push({
      kind: "warn",
      text: `Sekitar ${pct(wants, spending)}% belanja di luar tabungan ditandai sebagai keinginan. Ini area pertama yang paling mudah ditekan.`,
    });
  const over = snapshot.categories
    .map((c) => {
      const spent = monthTx()
          .filter((t) => t.type === "expense" && t.category_id === c.id)
          .reduce((s, t) => s + t.amount, 0),
        limit = (inc * c.pct) / 100;
      return { c, spent, limit };
    })
    .filter((x) => x.limit && x.spent > x.limit)
    .sort((a, b) => b.spent - b.limit - (a.spent - a.limit))[0];
  if (over)
    out.push({
      kind: "bad",
      text: `Kategori paling over-budget: ${over.c.name}, lebih ${rupiah(over.spent - over.limit)} dari alokasi.`,
    });
  if (!out.length)
    out.push({
      kind: "good",
      text: "Belum ada red flag besar bulan ini. Lanjutkan pencatatan supaya insight makin akurat.",
    });
  return out;
}
function renderDashboard() {
  const monthName = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(new Date(`${currentMonth}-01T00:00:00`));
  const summary = monthCashflow();
  renderDashboardView(app, { snapshot, currentMonth, summary, health: financialHealth(summary, snapshot.monthlySummary, currentMonth), monthName, rupiah, insightItems: insightItems(summary), onBind: bindCommon });
}
function renderTransactions() {
  renderTransactionsView(app, { snapshot, currentMonth, rupiah, onBind: bindCommon });
}
function renderBudget() {
  const income = monthCashflow().income;
  const expenses = monthTx().filter((transaction) => transaction.type === "expense");
  const totalSpent = expenses.reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const categoryIds = new Set(snapshot.categories.map((category) => category.id));
  const uncategorized = expenses
    .filter((transaction) => !categoryIds.has(transaction.category_id))
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const share = (value) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value);
  const renderItem = (category, spent, editable = true) => `<article class="budget-item" ${editable ? `data-id="${esc(category.id)}"` : ""} data-spent="${spent}">
    <div class="budget-item-head">
      <h3 class="budget-category-name">${esc(category.name)}</h3>
      <span class="budget-category-share">${share(Number(category.pct))}%</span>
      ${editable ? `<input class="budget-name-input cat-name" value="${esc(category.name)}" aria-label="Nama pos ${esc(category.name)}" maxlength="60" required disabled>
      <label class="budget-pct-input"><input class="cat-pct" type="number" inputmode="decimal" min="0" max="100" step="any" value="${Number(category.pct)}" aria-label="Persentase ${esc(category.name)}" required disabled><span aria-hidden="true">%</span></label>` : ""}
    </div>
    <div class="budget-item-values">
      <div><small>Alokasi</small><strong data-budget-limit></strong></div>
      <div><small>Terpakai</small><strong>${rupiah(spent)}</strong></div>
      <div class="budget-item-balance"><small data-budget-balance-label>Sisa</small><strong data-budget-remaining></strong></div>
    </div>
    <div class="budget-progress" role="progressbar" aria-label="Pemakaian ${esc(category.name)}" aria-valuemin="0" aria-valuemax="100"><span></span></div>
    <div class="budget-item-foot"><span data-budget-progress></span><span data-budget-state></span></div>
  </article>`;

  app.innerHTML = `<div class="content budget-content" data-editing="false">
    <form id="budgetForm" class="surface-panel budget-panel" aria-labelledby="budgetTitle" novalidate>
      <header class="budget-header">
        <div>
          <h2 id="budgetTitle">Alokasi pemasukan</h2>
          <p>Rencana, pemakaian, dan ruang tiap pos.</p>
        </div>
        <button id="editBudget" class="icon-btn" type="button" aria-label="Ubah alokasi budget" title="Ubah alokasi budget" ${snapshot.categories.length ? "" : "disabled"}>${icon("edit")}</button>
        <div class="budget-edit-actions" hidden>
          <button id="cancelBudget" class="icon-btn" type="button" aria-label="Batalkan perubahan budget" title="Batalkan perubahan">${icon("close")}</button>
          <button id="saveBudget" class="icon-btn budget-save" type="submit" aria-label="Simpan budget" title="Simpan budget">${icon("check")}</button>
        </div>
      </header>
      <div class="budget-summary" aria-label="Ringkasan budget">
        <div><span>Pemasukan</span><strong>${rupiah(income)}</strong><small>bulan terpilih</small></div>
        <div><span>Dialokasikan</span><strong data-budget-allocated></strong><small data-budget-total-pct></small></div>
        <div><span>Terpakai</span><strong>${rupiah(totalSpent)}</strong><small>${expenses.some((transaction) => transaction.goal_id) ? "termasuk setoran goals" : "belanja bulan ini"}</small></div>
        <div><span>Sisa budget</span><strong data-budget-total-remaining></strong><small>alokasi dikurangi pemakaian</small></div>
      </div>
      <p class="budget-plan-status" data-budget-plan-status role="status"></p>
      <p class="budget-alert" data-budget-alert hidden></p>
      <p class="budget-error" id="budgetError" role="alert" hidden></p>
      <div class="budget-list-heading"><span>Pos anggaran</span><span>${snapshot.categories.length} pos</span></div>
      <div class="budget-list">
        ${snapshot.categories.map((category) => renderItem(category, expenses
          .filter((transaction) => transaction.category_id === category.id)
          .reduce((sum, transaction) => sum + Number(transaction.amount), 0))).join("")}
        ${uncategorized ? renderItem({ name: "Tanpa kategori", pct: 0 }, uncategorized, false) : ""}
        ${snapshot.categories.length || uncategorized ? "" : '<p class="empty">Belum ada pos anggaran.</p>'}
      </div>
      <footer class="budget-footer"><span>Porsi dari pemasukan bulan terpilih, bukan saldo bawaan. Pemakaian termasuk setoran goals.</span><span class="budget-edit-note">Preview langsung berubah. Aturan porsi berlaku juga untuk bulan lain.</span></footer>
    </form>
  </div>`;

  const root = app.querySelector(".budget-content");
  const form = root.querySelector("#budgetForm");
  const errorBox = form.querySelector("#budgetError");
  const rows = [...form.querySelectorAll(".budget-item")];
  const readCategories = () => rows.filter((row) => row.dataset.id).map((row) => ({
    id: row.dataset.id,
    name: row.querySelector(".cat-name").value.trim(),
    pct: Number(row.querySelector(".cat-pct").value || 0),
  }));
  const updateTotals = () => {
    const currentTotalPct = readCategories().reduce((sum, category) => sum + category.pct, 0);
    const currentAllocated = (income * currentTotalPct) / 100;
    const remaining = currentAllocated - totalSpent;
    form.querySelector("[data-budget-allocated]").textContent = rupiah(currentAllocated);
    form.querySelector("[data-budget-total-pct]").textContent = `${share(currentTotalPct)}% pemasukan`;
    const remainingValue = form.querySelector("[data-budget-total-remaining]");
    remainingValue.textContent = rupiah(remaining);
    remainingValue.dataset.tone = remaining < 0 ? "bad" : "neutral";
    const status = form.querySelector("[data-budget-plan-status]");
    const excess = currentTotalPct > 100 + 1e-8;
    status.dataset.tone = excess ? "bad" : "neutral";
    status.textContent = excess
      ? `Alokasi melebihi 100% sebesar ${share(currentTotalPct - 100)}%. Kurangi porsi sebelum menyimpan.`
      : !income
        ? "Belum ada pemasukan di bulan ini. Nominal alokasi akan mengikuti pemasukan yang dicatat."
        : currentTotalPct < 100 - 1e-8
          ? `${share(100 - currentTotalPct)}% belum dibagi (${rupiah(income - currentAllocated)}).`
          : "100% pemasukan sudah dialokasikan.";
    let overBudget = 0;
    let withoutBudget = 0;
    rows.forEach((row) => {
      const rowPct = Number(row.querySelector(".cat-pct")?.value || 0);
      const spent = Number(row.dataset.spent || 0);
      const limit = (income * rowPct) / 100;
      const balance = limit - spent;
      const usage = limit > 0 ? Math.round((spent / limit) * 100) : 0;
      const progress = limit > 0 ? Math.min(100, usage) : spent > 0 ? 100 : 0;
      const unbudgeted = spent > 0 && limit <= 0;
      const over = limit > 0 && balance < 0;
      const tone = over ? "bad" : unbudgeted || usage >= 80 ? "warn" : "neutral";
      if (over) overBudget++;
      if (unbudgeted) withoutBudget++;
      row.dataset.tone = tone;
      row.querySelector("[data-budget-limit]").textContent = rupiah(limit);
      row.querySelector("[data-budget-remaining]").textContent = rupiah(Math.abs(balance));
      row.querySelector("[data-budget-balance-label]").textContent = balance < 0 ? "Lebih" : "Sisa";
      row.querySelector(".budget-progress span").style.width = `${progress}%`;
      row.querySelector(".budget-progress").setAttribute("aria-valuenow", String(progress));
      row.querySelector(".budget-progress").setAttribute("aria-valuetext", `${rupiah(spent)} terpakai dari ${rupiah(limit)}`);
      row.querySelector("[data-budget-progress]").textContent = unbudgeted ? "Tanpa alokasi" : `${usage}% terpakai`;
      row.querySelector("[data-budget-state]").textContent = over ? "Melebihi alokasi" : unbudgeted ? "Perlu alokasi" : usage >= 80 ? "Mendekati batas" : limit ? "Dalam alokasi" : "Belum dialokasikan";
    });
    const alerts = [overBudget ? `${overBudget} pos melebihi alokasi` : "", withoutBudget ? `${withoutBudget} pos terpakai tanpa alokasi` : ""].filter(Boolean);
    const alert = form.querySelector("[data-budget-alert]");
    alert.hidden = !alerts.length;
    alert.textContent = alerts.join(" · ");
  };
  form.querySelector("#editBudget").onclick = () => {
    root.dataset.editing = "true";
    form.querySelector("#editBudget").hidden = true;
    form.querySelector(".budget-edit-actions").hidden = false;
    form.querySelectorAll("input").forEach((input) => { input.disabled = false; });
    form.querySelector(".cat-pct")?.focus({ preventScroll: true });
  };
  form.querySelector("#cancelBudget").onclick = () => renderBudget();
  form.addEventListener("input", (event) => {
    errorBox.hidden = true;
    event.target.setCustomValidity("");
    updateTotals();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (root.dataset.editing !== "true" || form.getAttribute("aria-busy") === "true") return;
    form.querySelectorAll(".cat-name").forEach((input) => {
      input.setCustomValidity(input.value.trim() ? "" : "Nama pos wajib diisi.");
    });
    if (!validateForm(form)) return;
    const categories = readCategories();
    if (categories.reduce((sum, category) => sum + category.pct, 0) > 100 + 1e-8) {
      errorBox.textContent = "Total alokasi tidak boleh lebih dari 100%. Kurangi persentase pos terlebih dahulu.";
      errorBox.hidden = false;
      return;
    }
    try {
      await withPendingForm(form, () => api("/api/categories", {
        method: "PUT",
        body: JSON.stringify({ categories }),
      }));
      const replacements = new Map(categories.map((category) => [category.id, category]));
      snapshot.categories = snapshot.categories.map((category) => ({ ...category, ...replacements.get(category.id) }));
      if (form.isConnected) renderBudget();
      toast("Budget tersimpan");
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
      return;
    }
    try {
      await refreshSnapshot();
    } catch {
      toast("Budget tersimpan. Sinkronisasi akan dicoba lagi otomatis.");
    }
  });
  updateTotals();
}
function renderGoals() {
  renderGoalsView(app, {
    snapshot,
    currentMonth,
    rupiah,
    pct,
    api,
    toast,
    refresh: () => refreshSnapshot(),
    onSaveGoal: (goalId) => {
      const goal = snapshot.goals.find((item) => item.id === goalId);
      openTx({ type: "expense", note: `Tabungan ${goal.name}`, goalId: goal.id });
    },
  });
}
function renderReceipts() {
  app.innerHTML = `<div class="content"><div class="grid two"><div class="card"><div class="section-title"><div><h3>Scan nota</h3><p>OCR di browser, foto disimpan ke server setelah kamu review.</p></div></div><div class="receipt-drop"><input id="receiptFile" type="file" accept="image/*" capture="environment"><div id="ocrStatus" class="small muted" style="margin-top:10px">Foto / upload struk. Hasil OCR perlu direview.</div></div></div><div class="card"><div class="section-title"><div><h3>Gmail import</h3><p>Setiap member connect Gmail masing-masing, read-only.</p></div></div><div id="gmailBox">Mengecek...</div></div></div><div class="card" style="margin-top:16px"><h3>Kandidat Gmail</h3><div id="gmailCandidates" class="empty">Belum dimuat.</div></div></div>`;
  document.querySelector("#receiptFile").onchange = handleReceipt;
  loadGmailStatus();
}
async function fileToDataUrl(file) {
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
async function handleReceipt(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const box = document.querySelector("#ocrStatus");
  box.textContent = "Membaca nota...";
  try {
    if (!window.Tesseract) throw new Error("OCR library belum termuat");
    const dataUrl = await fileToDataUrl(file),
      {
        data: { text },
      } = await Tesseract.recognize(file, "eng");
    const amounts = [
        ...text.matchAll(/(?:rp\.?|idr)?\s*(\d{1,3}(?:[.\s]\d{3})+|\d{4,})/gi),
      ]
        .map((m) => Number(m[1].replace(/[.\s]/g, "")))
        .filter((n) => n >= 1000 && n < 1e9),
      amount = amounts.length ? Math.max(...amounts) : 0;
    box.innerHTML = `<img src="${dataUrl}" class="receipt-preview"><div class="insight"><b>OCR selesai</b><br>Nominal terdeteksi ${rupiah(amount)}<br><button id="useOcr" class="primary" style="margin-top:10px">Review transaksi</button></div>`;
    document.querySelector("#useOcr").onclick = async () => {
      const uploaded = await api("/api/receipts", {
        method: "POST",
        body: JSON.stringify({ dataUrl }),
      });
      openTx({
        type: "expense",
        amount,
        note: "Belanja dari nota",
        source: "receipt",
        receiptUrl: uploaded.url,
      });
    };
  } catch (err) {
    box.innerHTML = `<div class="insight bad">${esc(err.message)}</div>`;
  }
}
async function loadGmailStatus() {
  const box = document.querySelector("#gmailBox");
  try {
    const s = await api("/api/gmail/status");
    if (!s.configured) {
      box.innerHTML = `<div class="insight warn">Gmail belum diatur. Superadmin bisa mengisinya dari Settings.</div>`;
      return;
    }
    if (!s.connected) {
      box.innerHTML = `<a class="primary" href="/auth/google" style="display:inline-block;text-decoration:none">Connect Gmail</a><p class="small muted">Scope hanya gmail.readonly.</p>`;
      return;
    }
    box.innerHTML = `<div class="actions"><button class="primary" id="scanGmail">Scan 30 hari</button><button class="secondary" id="disconnectGmail">Disconnect</button></div>`;
    document.querySelector("#scanGmail").onclick = scanGmail;
    document.querySelector("#disconnectGmail").onclick = async () => {
      await api("/api/gmail/disconnect", { method: "POST" });
      loadGmailStatus();
    };
  } catch (e) {
    box.textContent = e.message;
  }
}
async function scanGmail() {
  const area = document.querySelector("#gmailCandidates");
  area.textContent = "Mencari kandidat transaksi...";
  try {
    const data = await api("/api/gmail/candidates?days=30");
    if (!data.items.length) {
      area.className = "empty";
      area.textContent = "Tidak menemukan kandidat.";
      return;
    }
    area.className = "";
    area.innerHTML = data.items
      .map(
        (x, i) =>
          `<div class="candidate"><div><b>${esc(x.subject || "(no subject)")}</b><div class="small muted">${esc(x.from)} · ${new Date(x.date).toLocaleDateString("id-ID")}</div><div class="small muted">${esc(x.snippet)}</div></div><div><b>${rupiah(x.amount)}</b><br><button class="secondary import-mail" data-i="${i}">Import</button></div></div>`,
      )
      .join("");
    document.querySelectorAll(".import-mail").forEach(
      (btn) =>
        (btn.onclick = () => {
          const x = data.items[Number(btn.dataset.i)];
          openTx({
            type: "expense",
            amount: x.amount,
            note: x.subject || "Import Gmail",
            date: x.date.slice(0, 10),
            source: "gmail",
            externalRef: x.id,
          });
        }),
    );
  } catch (e) {
    area.innerHTML = `<div class="insight bad">${esc(e.message)}</div>`;
  }
}
function renderFamily() {
  app.innerHTML = `<div class="content"><div class="grid two"><div class="card"><div class="section-title"><div><h3>Member household</h3><p>${esc(snapshot.household.name)}</p></div></div>${snapshot.members.map((m) => `<div class="member-row"><div><b>${esc(m.name)}</b><div class="small muted">${esc(m.email)}</div></div><span class="pill">${esc(m.role)}</span></div>`).join("")}</div><div class="card"><div class="section-title"><div><h3>Invite pasangan</h3><p>Link berlaku 7 hari.</p></div></div>${snapshot.household.role === "owner" ? `<button id="makeInvite" class="primary">Buat invite link</button><div id="inviteBox" style="margin-top:12px"></div>` : `<div class="insight">Hanya owner yang bisa membuat invite.</div>`}</div></div></div>`;
  document.querySelector("#makeInvite")?.addEventListener("click", async () => {
    const d = await api("/api/invites", { method: "POST" }),
      url = `${location.origin}${d.joinPath}`;
    document.querySelector("#inviteBox").innerHTML =
      `<div class="code-box">${esc(url)}</div><button id="copyInvite" class="secondary" style="margin-top:8px">Copy link</button>`;
    document.querySelector("#copyInvite").onclick = () =>
      navigator.clipboard
        .writeText(url)
        .then(() => toast("Invite link dicopy"));
  });
}
async function renderUsers() {
  if (!me.user.is_superadmin) {
    app.innerHTML = `<div class="content"><div class="card"><div class="insight bad">Akses ditolak. Halaman ini hanya untuk superadmin.</div></div></div>`;
    return;
  }
  app.innerHTML = `<div class="content"><div class="card"><div class="section-title"><div><h3>Kelola User</h3><p>Daftar pengguna terdaftar di sistem dan peran hak akses.</p></div><button id="addUserBtn" class="primary"><span class="button-icon">${icon("plus")}</span><span>Tambah User</span></button></div><div id="usersContainer" class="empty">Memuat daftar user...</div></div></div>`;
  document.querySelector("#addUserBtn").onclick = () => openUserDialog();
  await loadUsersList();
}
async function loadUsersList() {
  const container = document.querySelector("#usersContainer");
  try {
    const res = await api("/api/admin/users");
    if (!res.users.length) {
      container.innerHTML = `<div class="empty">Belum ada user terdaftar.</div>`;
      return;
    }
    container.className = "user-table-wrap";
    container.innerHTML = `
      <table class="user-table">
        <thead>
          <tr>
            <th>Nama</th>
            <th>Email</th>
            <th>Status</th>
            <th>Role</th>
            <th style="text-align:right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${res.users.map((u) => `
            <tr>
              <td><b>${esc(u.name)}</b>${u.id === me.user.id ? ` <span class="pill">Anda</span>` : ""}</td>
              <td class="muted">${esc(u.email)}</td>
              <td><span class="pill badge-${u.status}">${u.status === "active" ? "Aktif" : "Dinonaktifkan"}</span></td>
              <td>${u.is_superadmin ? `<span class="pill badge-admin">Superadmin</span>` : `<span class="pill">Member</span>`}</td>
              <td>
                <div class="user-actions">
                  <button class="icon-btn edit-user" data-user='${esc(JSON.stringify(u))}' title="Edit user" aria-label="Edit user">${icon("edit")}</button>
                  ${u.id !== me.user.id ? `<button class="icon-btn danger-action delete-user" data-id="${u.id}" data-name="${esc(u.name)}" title="Hapus user" aria-label="Hapus">${icon("trash")}</button>` : ""}
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>`;
    container.querySelectorAll(".edit-user").forEach((btn) => {
      btn.onclick = () => openUserDialog(JSON.parse(btn.dataset.user));
    });
    container.querySelectorAll(".delete-user").forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm(`Hapus akun user "${btn.dataset.name}"? Transaksi yang sudah tercatat akan tetap aman.`)) return;
        try {
          await api(`/api/admin/users/${btn.dataset.id}`, { method: "DELETE" });
          toast("User berhasil dihapus");
          await loadUsersList();
        } catch (err) {
          toast(err.message);
        }
      };
    });
  } catch (err) {
    container.className = "insight bad";
    container.textContent = err.message;
  }
}
function openUserDialog(userData = null) {
  editingUserId = userData ? userData.id : null;
  let dialog = document.querySelector("#userDialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "userDialog";
    document.body.append(dialog);
  }
  dialog.innerHTML = `
    <form method="dialog" id="userForm" class="dialog-card">
      <div class="dialog-head">
        <div>
          <div class="kicker">Admin kontrol</div>
          <h3>${userData ? "Edit User" : "Tambah User Baru"}</h3>
        </div>
        <button value="cancel" formnovalidate class="icon-btn" title="Tutup">×</button>
      </div>
      <label>Nama lengkap<input name="name" value="${esc(userData?.name || "")}" required placeholder="Misal: Budi Santoso"></label>
      <label>Email<input name="email" type="email" value="${esc(userData?.email || "")}" required placeholder="budi@keluarga.id"></label>
      <label>${userData ? "Password baru (kosongkan jika tidak diganti)" : "Password awal"}<input name="password" type="password" ${userData ? "" : "required minlength='12'"} placeholder="Minimal 12 karakter"></label>
      <label class="check" style="margin-top:2px"><input name="isSuperadmin" type="checkbox" ${userData?.is_superadmin ? "checked" : ""}> Jadikan Superadmin</label>
      <label>Status akun<select name="status"><option value="active" ${userData?.status !== "disabled" ? "selected" : ""}>Aktif</option><option value="disabled" ${userData?.status === "disabled" ? "selected" : ""}>Dinonaktifkan</option></select></label>
      <div id="userFormError" class="insight bad hidden"></div>
      <button class="primary wide" value="default" style="margin-top:6px">
        <span class="button-icon">${icon("save")}</span>
        <span>${userData ? "Simpan Perubahan" : "Buat Akun"}</span>
      </button>
    </form>`;
  dialog.querySelector("button[value=cancel]").onclick = () => dialog.close();
  dialog.querySelector("#userForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const errBox = dialog.querySelector("#userFormError");
    errBox.classList.add("hidden");
    const payload = {
      name: String(f.get("name") || ""),
      email: String(f.get("email") || ""),
      isSuperadmin: Boolean(f.get("isSuperadmin")),
      status: String(f.get("status") || "active"),
    };
    const pwd = String(f.get("password") || "").trim();
    if (pwd) payload.password = pwd;
    try {
      if (editingUserId) {
        await api(`/api/admin/users/${editingUserId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        toast("User berhasil diupdate");
      } else {
        if (!pwd || pwd.length < 12) throw new Error("Password minimal 12 karakter");
        await api("/api/admin/users", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast("User baru berhasil dibuat");
      }
      dialog.close();
      await loadUsersList();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove("hidden");
    }
  };
  dialog.showModal();
}
function renderSettings() {
  renderSettingsView(app, {
    snapshot,
    user: me.user,
    api,
    toast,
    onWorkspaceSaved: () => refreshSnapshot(),
  });
}
function openTx(prefill = {}) {
  const today = localDateValue();
  const date = prefill.date || prefill.tx_date || (followingCurrentMonth || currentMonth === today.slice(0, 7) ? today : `${currentMonth}-01`);
  txDialog?.open({ ...prefill, date });
}
function bindCommon() {
  document.querySelector("#addTx2")?.addEventListener("click", () => openTx());
  document.querySelectorAll("[data-go]").forEach(
    (b) =>
      (b.onclick = () => {
        navigate(b.dataset.go);
      }),
  );
  document.querySelectorAll(".edit-tx").forEach((el) => {
    el.onclick = () => {
      const tx = snapshot.transactions.find((item) => item.id === el.dataset.id);
      if (tx) openTx(tx);
    };
  });
  document.querySelectorAll("[data-quick-goal]").forEach((el) => {
    el.onclick = () => {
      navigate("goals");
      setTimeout(() => {
        document.querySelector("#addGoal")?.click();
      }, 60);
    };
  });
  document.querySelectorAll(".delete-tx").forEach(
    (b) =>
      (b.onclick = async () => {
        if (!confirm("Hapus transaksi ini?")) return;
        try {
          await api(`/api/transactions/${b.dataset.id}`, { method: "DELETE" });
          await refreshSnapshot();
        } catch (error) {
          toast(error.message);
        }
      }),
  );
}
function navigate(view) {
  const fromMenu = moreDialog.open;
  currentView = view;
  setMonthPickerOpen(false);
  setMoreOpen(false);
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
  if (fromMenu) pageTitle.focus({ preventScroll: true });
}
document.querySelectorAll(".nav").forEach((button) => {
  button.onclick = () => navigate(button.dataset.view);
});
function setMoreOpen(open) {
  if (open) {
    setMonthPickerOpen(false);
    closeSelects();
    if (!moreDialog.open) moreDialog.showModal();
    document.body.classList.add("menu-open");
    moreButton.setAttribute("aria-expanded", "true");
  } else if (moreDialog.open) moreDialog.close();
}
moreButton.onclick = () => setMoreOpen(true);
moreDialog.querySelector(".more-close").onclick = () => setMoreOpen(false);
moreDialog.querySelector(".more-close").innerHTML = icon("close");
moreDialog.addEventListener("click", (event) => {
  if (!event.target.closest(".more-sheet")) setMoreOpen(false);
});
moreDialog.addEventListener("close", () => {
  document.body.classList.remove("menu-open");
  moreButton.setAttribute("aria-expanded", "false");
});
function setMonthPickerOpen(open) {
  monthControl.classList.toggle("open", open);
  monthPicker.setAttribute("aria-expanded", String(open));
}
monthPicker.onclick = () => setMonthPickerOpen(monthPicker.getAttribute("aria-expanded") !== "true");
document.querySelector(".month-picker-chevron").innerHTML = icon("chevron");
document.addEventListener("pointerdown", (event) => {
  if (!monthControl.contains(event.target)) setMonthPickerOpen(false);
});
monthControl.addEventListener("focusout", (event) => {
  if (!monthControl.contains(event.relatedTarget)) setMonthPickerOpen(false);
});
window.matchMedia("(max-width: 760px)").addEventListener("change", () => {
  setMonthPickerOpen(false);
  setMoreOpen(false);
});
document.querySelector("#prevMonthBtn").innerHTML = icon("chevronLeft");
document.querySelector("#nextMonthBtn").innerHTML = icon("chevronRight");
document.querySelector("#currentMonthBtn").innerHTML = `${icon("today")}<span class="month-reset-label">Bulan ini</span>`;
document.querySelector("#prevMonthBtn").onclick = () => shiftMonth(-1);
document.querySelector("#nextMonthBtn").onclick = () => shiftMonth(1);
document.querySelector("#currentMonthBtn").onclick = () => {
  const wasOpen = monthPicker.getAttribute("aria-expanded") === "true";
  resetMonth();
  setMonthPickerOpen(false);
  if (wasOpen) monthPicker.focus();
};
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setMoreOpen(false);
    if (monthPicker.getAttribute("aria-expanded") === "true") {
      setMonthPickerOpen(false);
      monthPicker.focus();
    }
  }
});
document.querySelector("#quickAdd").onclick = () => {
  setMonthPickerOpen(false);
  openTx();
};
document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("close", closeSelects);
});
const navigationIcons = { dashboard: "overview", transactions: "ledger", budget: "allocation", goals: "target", receipts: "receipt", family: "family", users: "admin", settings: "sliders" };
document.querySelectorAll(".nav").forEach((button) => {
  button.querySelector(".nav-icon").innerHTML = icon(navigationIcons[button.dataset.view]);
});
moreButton.querySelector(".nav-icon").innerHTML = icon("more");
document.querySelector("#quickAdd").innerHTML = icon("plus");
document.querySelector("#quickAdd").title = "Catat transaksi";
document.querySelector("#quickAdd").setAttribute("aria-label", "Catat transaksi");
document.querySelector("#quickAdd").classList.add("quick-add");
txDialog = createTransactionDialog({
  dialog: document.querySelector("#txDialog"),
  getSnapshot: () => snapshot,
  save: (payload, id) => api(id ? `/api/transactions/${encodeURIComponent(id)}` : "/api/transactions", { method: id ? "PUT" : "POST", body: JSON.stringify(payload) }),
  onDelete: async (id) => {
    await api(`/api/transactions/${encodeURIComponent(id)}`, { method: "DELETE" });
    toast("Transaksi dihapus");
    await refreshSnapshot().catch(() => {});
  },
  onSaved: async (id) => {
    toast(id ? "Koreksi tersimpan" : "Transaksi tersimpan");
    await refreshSnapshot().catch(() => {});
  },
});
if ("serviceWorker" in navigator)
  navigator.serviceWorker.register("/sw.js").catch(() => {});
bindMoneyInputs();
boot();

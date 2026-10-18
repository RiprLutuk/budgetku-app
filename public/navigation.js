const views = new Set(["dashboard", "transactions", "budget", "goals", "receipts", "family", "users", "settings"]);
const validMonth = (value) => typeof value === "string" && /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(value);

export function createNavigation({ getUser, getCurrentMonth }) {
  const storageKey = () => {
    const user = getUser?.();
    return user?.id ? `budgetku:navigation:${user.id}` : null;
  };
  function normalize(state) {
    const today = getCurrentMonth();
    const user = getUser?.();
    const view = views.has(state?.view) && (state.view !== "users" || Boolean(user?.is_superadmin)) ? state.view : "dashboard";
    const month = validMonth(state?.month) ? state.month : today;
    return { view, month, followingCurrentMonth: month === today };
  }
  function remember(state) {
    const key = storageKey();
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify({ view: state.view, month: state.followingCurrentMonth ? null : state.month }));
    } catch {}
  }
  function save(state, { replace = false } = {}) {
    const next = normalize(state);
    const url = new URL(location.href);
    url.hash = next.view;
    if (next.followingCurrentMonth) url.searchParams.delete("month");
    else url.searchParams.set("month", next.month);
    if (url.href !== location.href) history[replace ? "replaceState" : "pushState"](history.state, "", url);
    remember(next);
    return next;
  }
  function restore({ useSaved = true } = {}) {
    const url = new URL(location.href);
    let saved = {};
    const key = storageKey();
    if (useSaved && !url.hash && key) {
      try {
        saved = JSON.parse(localStorage.getItem(key)) || {};
      } catch {}
    }
    return save({
      view: url.hash ? url.hash.slice(1).replace(/^\//, "") : saved.view,
      month: url.searchParams.has("month") ? url.searchParams.get("month") : url.hash ? null : saved.month,
    }, { replace: true });
  }
  return { restore, save };
}

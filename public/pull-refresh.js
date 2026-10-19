export function createPullRefresh({ root, indicator, canRefresh, onRefresh }) {
  const label = indicator.querySelector("[data-pull-label]");
  const threshold = 64;
  let gesture = null;
  let distance = 0;
  let refreshing = false;
  let hideTimer;
  const scrollTop = () => Math.max(root.scrollTop || 0, document.scrollingElement?.scrollTop || 0);

  function hide() {
    clearTimeout(hideTimer);
    gesture = null;
    distance = 0;
    if (!refreshing) {
      indicator.hidden = true;
      indicator.dataset.state = "idle";
    }
  }
  function show(state, message, offset = threshold) {
    clearTimeout(hideTimer);
    indicator.hidden = false;
    indicator.dataset.state = state;
    indicator.style.setProperty("--pull-distance", `${offset}px`);
    indicator.style.setProperty("--pull-rotation", `${offset / threshold * 180}deg`);
    indicator.style.setProperty("--pull-progress", `${Math.min(1, offset / threshold)}`);
    indicator.style.setProperty("--pull-angle", `${Math.min(360, Math.round(offset / threshold * 360))}deg`);
    if (label.textContent !== message) label.textContent = message;
  }
  async function refresh() {
    if (refreshing || !canRefresh()) return;
    gesture = null;
    distance = 0;
    refreshing = true;
    show("loading", "Memperbarui data...");
    try {
      await onRefresh();
      show("success", "Data sudah diperbarui");
    } catch {
      show("error", navigator.onLine ? "Gagal memperbarui. Coba lagi." : "Sedang offline. Data belum diperbarui.");
    } finally {
      refreshing = false;
      hideTimer = setTimeout(hide, indicator.dataset.state === "error" ? 3000 : 1200);
    }
  }
  function nestedScroller(target) {
    for (let element = target; element && element !== root; element = element.parentElement) {
      if (element.scrollHeight > element.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(element).overflowY)) return true;
    }
    return false;
  }
  function start(event) {
    hide();
    if (refreshing || event.touches.length !== 1 || !canRefresh() || scrollTop() > 1 || (window.visualViewport?.scale || 1) > 1.01) return;
    const target = event.target;
    if (target.closest("input, textarea, select, button, a, label, summary, [contenteditable]:not([contenteditable='false']), [role='slider']") || nestedScroller(target)) return;
    const touch = event.touches[0];
    gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY };
  }
  function move(event) {
    if (!gesture) return;
    if (event.touches.length !== 1 || !canRefresh() || scrollTop() > 1) return hide();
    const touch = [...event.touches].find((item) => item.identifier === gesture.id);
    if (!touch) return hide();
    const vertical = touch.clientY - gesture.y;
    const horizontal = Math.abs(touch.clientX - gesture.x);
    if (vertical < 0 || (horizontal > 10 && horizontal > vertical)) return hide();
    if (!event.cancelable) return hide();
    event.preventDefault();
    distance = Math.min(84, Math.max(0, (vertical - 10) * 0.5));
    if (!distance) {
      indicator.hidden = true;
      return;
    }
    show(distance >= threshold ? "ready" : "pulling", distance >= threshold ? "Lepas untuk memperbarui" : "Tarik untuk memperbarui", distance);
  }
  function end(event) {
    if (event.touches.length) return hide();
    if (gesture && distance >= threshold) void refresh();
    else hide();
  }
  root.addEventListener("touchstart", start, { passive: true });
  root.addEventListener("touchmove", move, { passive: false });
  root.addEventListener("touchend", end, { passive: true });
  root.addEventListener("touchcancel", hide, { passive: true });
  return { refresh };
}

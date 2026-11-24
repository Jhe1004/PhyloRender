/* Change the screen panels only. Keep SVG geometry and tree data unchanged. */
(function () {
  "use strict";
  const layout = document.getElementById("phylorender-layout");
  const divider = document.getElementById("panel-divider");
  const restoreButton = document.getElementById("panel-restore");
  if (!layout || !divider) return;
  const controls = layout.querySelector(".controls");
  const storageKey = "phylorender.controls-width.v1";
  const collapsedKey = "phylorender.controls-collapsed.v1";
  const collapseOvershoot = 48;
  let preferredWidth = null;
  let collapsed = false;
  let drag = null;
  try {
    const stored = Number(localStorage.getItem(storageKey));
    if (Number.isFinite(stored) && stored >= 280) preferredWidth = stored;
    collapsed = localStorage.getItem(collapsedKey) === "true";
  } catch { /* File pages/private browsers may deny storage; resizing still works. */ }

  function panelWidthBounds(totalWidth) {
    return { minimum: 280, maximum: Math.max(280, Math.min(totalWidth - 248, totalWidth * .75)) };
  }
  function defaultWidth() { return window.innerWidth <= 800 ? 286 : 320; }
  function applyWidth(value) {
    const hidden = collapsed && window.innerWidth > 640;
    layout.classList.toggle("controls-collapsed", hidden);
    if (restoreButton) restoreButton.hidden = !hidden;
    controls.inert = hidden;
    if (hidden) controls.setAttribute("aria-hidden", "true");
    else controls.removeAttribute("aria-hidden");
    divider.title = hidden ? "Click arrow or drag right to expand workbench" :
      "Drag horizontally to resize; drag past minimum to collapse; press Enter to toggle; double-click to reset";
    if (window.innerWidth <= 640) return;
    const bounds = panelWidthBounds(layout.getBoundingClientRect().width);
    const width = hidden ? 0 : Math.max(bounds.minimum, Math.min(bounds.maximum, value));
    layout.style.setProperty("--controls-width", `${width}px`);
    divider.setAttribute("aria-valuemin", "0");
    divider.setAttribute("aria-valuemax", String(Math.round(bounds.maximum)));
    divider.setAttribute("aria-valuenow", String(Math.round(width)));
    divider.setAttribute("aria-valuetext", hidden ? "Workbench collapsed; drag right or press Enter to expand" :
      `Workbench panel width ${Math.round(width)} px`);
    window.dispatchEvent(new Event("phylorender-panel-resize"));
    return width;
  }
  function persist() {
    try {
      if (preferredWidth === null) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, String(preferredWidth));
      if (collapsed) localStorage.setItem(collapsedKey, "true");
      else localStorage.removeItem(collapsedKey);
    } catch { /* No storage is required for this interaction. */ }
  }
  function finishDrag(cancel = false) {
    if (!drag) return;
    const previous = drag;
    drag = null;
    if (cancel) {
      preferredWidth = previous.preferred;
      collapsed = previous.collapsed;
      applyWidth(previous.startWidth);
    } else {
      preferredWidth = collapsed ? previous.expandedWidth : Number(divider.getAttribute("aria-valuenow"));
      persist();
    }
    document.body.classList.remove("panel-resizing");
    if (divider.hasPointerCapture(previous.pointerId)) divider.releasePointerCapture(previous.pointerId);
  }
  divider.addEventListener("pointerdown", event => {
    if (!event.isPrimary || event.button !== 0 || window.innerWidth <= 640) return;
    event.preventDefault();
    drag = { pointerId: event.pointerId, startX: event.clientX,
      startWidth: controls.getBoundingClientRect().width, preferred: preferredWidth, collapsed,
      expandedWidth: collapsed ? (preferredWidth ?? defaultWidth()) : controls.getBoundingClientRect().width,
      anchorX: event.clientX, anchorWidth: controls.getBoundingClientRect().width };
    divider.setPointerCapture(event.pointerId);
    divider.focus({ preventScroll: true });
    document.body.classList.add("panel-resizing");
  });
  divider.addEventListener("pointermove", event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const delta = event.clientX - drag.anchorX;
    if (collapsed) {
      if (delta < collapseOvershoot) return;
      collapsed = false;
      drag.anchorWidth = applyWidth(drag.expandedWidth);
      drag.anchorX = event.clientX;
    } else {
      const requested = drag.anchorWidth + delta;
      if (requested < 280 - collapseOvershoot) {
        drag.expandedWidth = Number(divider.getAttribute("aria-valuenow"));
        collapsed = true;
        applyWidth(0);
        drag.anchorWidth = 0;
        drag.anchorX = event.clientX;
      } else applyWidth(requested);
    }
  });
  divider.addEventListener("pointerup", event => { if (drag?.pointerId === event.pointerId) finishDrag(); });
  divider.addEventListener("pointercancel", () => finishDrag(true));
  divider.addEventListener("lostpointercapture", () => finishDrag(true));
  window.addEventListener("blur", () => finishDrag(true));
  window.addEventListener("keydown", event => { if (event.key === "Escape" && drag) finishDrag(true); });
  divider.addEventListener("keydown", event => {
    if (drag || window.innerWidth <= 640) return;
    const bounds = panelWidthBounds(layout.getBoundingClientRect().width);
    const current = Number(divider.getAttribute("aria-valuenow"));
    if (event.key === "Enter" || (collapsed && event.key === "ArrowRight") ||
        (!collapsed && event.key === "ArrowLeft" && current === bounds.minimum)) {
      event.preventDefault();
      if (!collapsed) preferredWidth = current;
      collapsed = !collapsed;
      applyWidth(preferredWidth ?? defaultWidth());
      persist();
      return;
    }
    const step = event.shiftKey ? 40 : 10;
    const next = { ArrowLeft: current - step, ArrowRight: current + step,
      Home: bounds.minimum, End: bounds.maximum }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    if (collapsed && event.key === "ArrowLeft") return;
    collapsed = false;
    preferredWidth = applyWidth(next);
    persist();
  });
  divider.addEventListener("dblclick", () => {
    finishDrag(true); preferredWidth = null; collapsed = false;
    applyWidth(defaultWidth()); persist();
  });
  if (restoreButton) restoreButton.addEventListener("click", () => {
    finishDrag(true);
    collapsed = false;
    applyWidth(preferredWidth ?? defaultWidth());
    persist();
    divider.focus({ preventScroll: true });
  });
  window.addEventListener("resize", () => {
    finishDrag(true);
    applyWidth(preferredWidth ?? defaultWidth());
  }, { passive: true });
  applyWidth(preferredWidth ?? defaultWidth());
})();

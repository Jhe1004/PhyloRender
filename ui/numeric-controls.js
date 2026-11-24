(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhyloRenderNumericControls=api;})(globalThis,function(){
  "use strict";

  let refreshers = [];
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const decimalPlaces = value => String(value).includes(".") ? String(value).split(".")[1].length : 0;

  function dispatchValue(input) {
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function button(input, direction, label, update) {
    const element = input.ownerDocument.createElement("button");
    element.type = "button";
    element.id = `${input.id}-${direction < 0 ? "decrease" : "increase"}`;
    element.textContent = direction < 0 ? "−" : "＋";
    element.setAttribute("aria-label", `${label}, ${direction < 0 ? "decrease" : "increase"}`);
    element.addEventListener("click", () => update(direction));
    return element;
  }

  function createCompactNumericStepper(input, options = {}) {
    const label = options.label || input.getAttribute("aria-label")
      || input.ownerDocument.querySelector(`label[for="${input.id}"]`)?.textContent?.trim() || "Value";
    const stepper = input.ownerDocument.createElement("div");
    stepper.className = "numeric-stepper compact-numeric-stepper";
    if (options.point) stepper.classList.add("compact-point-stepper");
    const update = direction => {
      const fallback = typeof options.fallback === "function" ? options.fallback() : options.fallback;
      const current = input.value !== "" && Number.isFinite(Number(input.value)) ? Number(input.value) : Number(fallback || 0);
      const step = Number(input.step) || 1;
      const minimum = input.min === "" ? -Infinity : Number(input.min);
      const maximum = input.max === "" ? Infinity : Number(input.max);
      input.value = String(Number(clamp(current + direction * step, minimum, maximum).toFixed(10)));
      dispatchValue(input);
    };
    stepper.append(button(input, -1, label, update), input, button(input, 1, label, update));
    input.inputMode = "decimal";
    return stepper;
  }

  function addUnitToLabel(label, unit, point) {
    if (!label || !unit || label.querySelector(".numeric-unit")) return;
    const suffix = label.ownerDocument.createElement("span");
    suffix.className = `numeric-unit${point ? " point-unit" : ""}`;
    suffix.textContent = ` · ${unit}`;
    label.append(suffix);
  }

  function compactExistingCard(range, number, config, point) {
    const card = range.closest(".numeric-card");
    if (!card || !number) return;
    card.classList.add("compact-numeric-control");
    if (point) card.classList.add("compact-point-control");
    range.hidden = true;
    range.tabIndex = -1;
    const label = card.querySelector(`label[for="${range.id}"]`);
    if (label) label.htmlFor = number.id;
    addUnitToLabel(label, config.unit, point);
    const stepper = number.closest(".numeric-stepper");
    stepper?.classList.add("compact-numeric-stepper");
    if (point) stepper?.classList.add("compact-point-stepper");
    number.setAttribute("aria-label", `${label?.textContent?.trim() || range.id}, enter value`);
  }

  function compactRange(dom, range, { unit = "", displayFactor = 1, displayStep, decimals, point = false } = {}) {
    const label = dom.querySelector(`label[for="${range.id}"]`);
    const number = dom.createElement("input");
    number.type = "number";
    number.id = `${range.id}-number`;
    number.min = String(Number(range.min) * displayFactor);
    number.max = String(Number(range.max) * displayFactor);
    number.step = String(displayStep ?? Number(range.step) * displayFactor);
    if (displayFactor !== 1) range.step = "any";
    number.setAttribute("aria-label", `${label?.textContent?.trim() || range.id}, enter value`);
    const precision = decimals ?? decimalPlaces(number.step);
    const sync = () => { number.value = String(Number((Number(range.value) * displayFactor).toFixed(precision))); };
    const commit = eventType => {
      if (number.value === "" || !Number.isFinite(Number(number.value))) {
        if (eventType === "input") return;
        return sync();
      }
      const raw = Number(number.value);
      const displayed = clamp(raw, Number(number.min), Number(number.max));
      if (eventType === "input") {
        if (raw >= Number(number.min) && raw <= Number(number.max)) {
          range.value = String(raw / displayFactor);
          range.dispatchEvent(new Event("input", { bubbles: true }));
        }
        return;
      }
      range.value = String(displayed / displayFactor);
      sync();
      range.dispatchEvent(new Event(eventType, { bubbles: true }));
    };
    number.addEventListener("input", () => commit("input"));
    number.addEventListener("change", () => commit("change"));
    number.addEventListener("blur", () => {
      if (number.value === "" || !Number.isFinite(Number(number.value))) sync();
    });
    range.addEventListener("input", sync);
    range.addEventListener("change", sync);
    const stepper = createCompactNumericStepper(number, { point, label: label?.textContent?.trim(), fallback: () => Number(range.value) * displayFactor });
    stepper.classList.add("standalone-compact-numeric");
    range.hidden = true;
    range.tabIndex = -1;
    label?.querySelector("output")?.setAttribute("hidden", "");
    addUnitToLabel(label, unit, point);
    if (label) label.htmlFor = number.id;
    range.after(stepper);
    sync();
    refreshers.push(sync);
  }

  function compactBoundedNumber(dom, input, unit) {
    if (!input || input.parentElement?.classList.contains("compact-numeric-stepper")) return;
    const label = dom.querySelector(`label[for="${input.id}"]`);
    const parent = input.parentNode;
    const next = input.nextSibling;
    addUnitToLabel(label, unit, false);
    const stepper = createCompactNumericStepper(input, { label: label?.textContent?.trim(), fallback: () => Number(input.defaultValue || 0) });
    stepper.classList.add("standalone-compact-numeric");
    parent.insertBefore(stepper, next);
  }

  function configure({ dom, configs, pointIds, timeTypes, timeFallback }) {
    refreshers = [];
    dom.querySelectorAll(".help-note-icon").forEach(icon => { icon.textContent = "?"; });
    for (const config of configs) {
      compactExistingCard(dom.getElementById(config.rangeId), dom.getElementById(config.numberId), config, pointIds.has(config.rangeId));
    }
    for (const { rangeId, numberId, unit } of [
      { rangeId: "support-decimals-range", numberId: "support-decimals-number", unit: "places" },
      { rangeId: "support-threshold", numberId: "support-threshold-number", unit: "%" },
    ]) {
      compactExistingCard(dom.getElementById(rangeId), dom.getElementById(numberId), { unit }, false);
    }
    for (const type of timeTypes) {
      const input = dom.getElementById(`time-${type}-size`);
      if (input.closest("[hidden]")) continue;
      const label = dom.querySelector(`label[for="${input.id}"]`);
      if (label) label.textContent = label.textContent.replace(/\s*·?\s*[\uff08(]?pt[\uff09)]?/g,'');
      compactRange(dom,input,{unit:'u',displayFactor:globalThis.PhyloRenderUnits.ptToDrawing(1),displayStep:.25,decimals:2,point:true});
    }
    compactRange(dom, dom.getElementById("cloud-opacity"), { unit: "%", decimals: 0 });
    compactRange(dom, dom.getElementById("cloud-jitter"), { unit: "%", decimals: 0 });
    compactRange(dom, dom.getElementById("cloud-pie-radius"), { unit: "u", displayFactor:globalThis.PhyloRenderUnits.designToDrawing(1), displayStep:1, decimals:2 });
    compactRange(dom, dom.getElementById("cloud-pie-legend-scale"), { unit: "%", decimals: 0 });
    compactRange(dom, dom.getElementById("time-hpd-opacity"), { unit: "%", displayFactor: 100, decimals: 0 });
    compactRange(dom, dom.getElementById("time-hpd-thickness"), { unit: "u", displayFactor:globalThis.PhyloRenderUnits.designToDrawing(1), displayStep:.25, decimals:2 });
    compactBoundedNumber(dom, dom.getElementById("cloud-phyparts-threshold"), "%");
  }

  function refresh() { refreshers.forEach(sync => sync()); }

return Object.freeze({configure,createCompactNumericStepper,compactBoundedNumber,refresh});
});

(function attachDatingLabelPolicy(root, factory) {
  "use strict";
  const api = factory();
  root.PhyloRenderDatingLabelPolicy=api;
  if (typeof module === "object" && module.exports) module.exports = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createDatingLabelPolicy() {
  "use strict";

  function inspection({ candidateLabels, rootAge }, contract) {
    const plan = contract.datingLabelPlan({ candidateLabels, rootAge });
    return Object.freeze({
      candidate_labels: plan.candidateLabels,
      dense: plan.dense,
      threshold: plan.threshold,
      default_older_fraction: plan.defaultOlderFraction,
      default_minimum_raw: plan.effectiveRange.minimumRaw,
      default_maximum_raw: plan.effectiveRange.maximumRaw,
      full_labels_age_minimum_raw: 0,
      full_labels_deadline_seconds: contract.datingLabelDensity.fullRenderDeadlineSeconds,
      display_only: true,
    });
  }

  function summary({ ages, rootAge, range }, contract) {
    const values = (ages || []).filter(Number.isFinite);
    const plan = contract.datingLabelPlan({ candidateLabels: values.length, rootAge, range });
    const { minimumRaw, maximumRaw } = plan.effectiveRange;
    const visible = values.filter(age => (minimumRaw === null || age >= minimumRaw)
      && (maximumRaw === null || age <= maximumRaw)).length;
    return Object.freeze({
      plan,
      warning: plan.automaticApplied
        ? `Detected ${plan.candidateLabels} candidate node-age labels; dense time-tree policy shows only the older 50% by default while hiding younger node numbers and markers (HPD bars, branch lengths, and time coordinates remain unchanged).`
        : null,
      report: Object.freeze({
        candidate_nodes: plan.candidateLabels,
        dense: plan.dense,
        threshold: plan.threshold,
        selection: plan.automaticApplied ? "automatic_older_half" : plan.explicit ? "explicit_range" : "all",
        default_older_fraction: plan.defaultOlderFraction,
        effective_minimum_raw: minimumRaw,
        effective_maximum_raw: maximumRaw,
        visible_nodes: visible,
        hidden_nodes: plan.candidateLabels - visible,
        display_only: true,
      }),
    });
  }

  return Object.freeze({ inspection, summary });
}));

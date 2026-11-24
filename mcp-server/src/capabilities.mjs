// Read-only preflight; never installs dependencies or submits scientific jobs.
const cache = new Map();
export async function runtimeCapabilities(pageUrl) {
  if (!pageUrl) return { render_process: "unknown", engines: {}, fonts: "checked per figure" };
  const prior = cache.get(pageUrl);
  if (prior && Date.now() - prior.at < 5000) return prior.value;
  const endpoints = { phyparts: "cloud-phyparts", treepl: "cloud-date", taxon_names: "taxon-names" };
  const engines = Object.fromEntries(await Promise.all(Object.entries(endpoints).map(async ([name, endpoint]) => {
    try {
      const response = await fetch(new URL(`/api/${endpoint}/status`, pageUrl), { signal: AbortSignal.timeout(2000) });
      if (!response.ok) throw new Error("unavailable");
      const status = await response.json();
      return [name, { available: status.available === true, engine: status.engine ?? null,
        algorithm: status.algorithm ?? null, commit: status.commit ?? null,
        check: "installed runtime; not a scientific execution test" }];
    } catch { return [name, { available: null, check: "status could not be read" }]; }
  })));
  const value = { render_process: "ready", engines, fonts: "actual selection recorded per rendered figure" };
  cache.clear(); cache.set(pageUrl, { at: Date.now(), value });
  return value;
}

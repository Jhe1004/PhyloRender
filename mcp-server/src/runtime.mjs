import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import contract from "../../figure-contract.js";
import pngRaster from "../../render/png-raster.js";
import "../../figure-units.js";

const SOURCE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const MCP_ROOT = path.resolve(SOURCE_DIR, "..");
export const PROJECT_ROOT = path.resolve(MCP_ROOT, "..");

async function agentCall(page, method, input, renderOptions) {
  const envelope = await page.evaluate(async ({ method, input, renderOptions }) => {
    try { return { value: await window.PhyloRenderAgent[method](input, renderOptions) }; }
    catch (error) { return { error: { message: error.message, code: error.code || "INVALID_FIGURE",
      retryable: false, issues: error.issues || [], field: error.field || null } }; }
  }, { method, input, renderOptions });
  if (envelope.error) throw Object.assign(new Error(envelope.error.message), envelope.error);
  return envelope.value;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function findBrowserExecutable() {
  const configured = process.env.PHYLORENDER_BROWSER_EXECUTABLE;
  const candidates = [
    configured,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    process.platform === "win32" && process.env.PROGRAMFILES
      ? path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe")
      : null,
    chromium.executablePath(),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  throw new Error(
    "No Chromium-compatible browser was found. Run `npm run install-browser` in mcp-server or set PHYLORENDER_BROWSER_EXECUTABLE.",
  );
}

function freeLocalPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

function probeUrl(url, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === "https:" ? https : http;
    const request = client.get(parsed, response => {
      request.setTimeout(0);
      response.resume();
      const status = Number(response.statusCode) || 0;
      if (status >= 200 && status < 400) resolve();
      else reject(new Error(`HTTP ${status}`));
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`request timed out after ${timeoutMs} ms`));
    });
    request.once("error", reject);
  });
}

async function waitForUrl(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      await probeUrl(url, Math.min(5_000, Math.max(500, deadline - Date.now())));
      return;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  throw new Error(`PhyloRender page server did not become ready: ${lastError?.message || "timeout"}`);
}

async function startPhyloRenderPageServer() {
  if (process.env.PHYLORENDER_APP_URL) {
    const url = new URL(process.env.PHYLORENDER_APP_URL).toString();
    await waitForUrl(url);
    return { url, child: null };
  }
  const port = await freeLocalPort();
  const python = process.env.PHYLORENDER_PYTHON || "python3";
  const script = path.join(PROJECT_ROOT, "tools", "local_server.py");
  const child = spawn(python, [script, "--host", "127.0.0.1", "--port", String(port), "--owner-stdin"], {
    cwd: PROJECT_ROOT,
    // Only this private service is owned by the MCP runtime. Pipe EOF also
    // reaches it when Node is SIGKILLed; external APP_URL services are not owned.
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdout.on("data", chunk => {
    if (process.env.PHYLORENDER_DEBUG) process.stderr.write(`[page] ${chunk}`);
  });
  child.stderr.on("data", chunk => {
    if (process.env.PHYLORENDER_DEBUG) process.stderr.write(`[page] ${chunk}`);
  });
  const exitPromise = new Promise((_, reject) => {
    child.once("error", reject);
    child.once("exit", code => {
      if (code !== null && code !== 0) reject(new Error(`PhyloRender page server exited with code ${code}`));
    });
  });
  const url = `http://127.0.0.1:${port}/`;
  try { await Promise.race([waitForUrl(url), exitPromise]); }
  catch (error) { await stopOwnedPageServer(child); throw error; }
  return { url, child };
}

function boundedPngScale(width, height, requestedScale = 2) {
  const maximumPixels = Math.max(1_000_000, Number(process.env.PHYLORENDER_MAX_PNG_PIXELS) || contract.rasterization.maximumPixels);
  return Math.max(1 / Math.max(1, width, height), Math.min(requestedScale, Math.sqrt(maximumPixels / Math.max(1, width * height)), contract.rasterization.maximumDimension / width, contract.rasterization.maximumDimension / height));
}

async function rasterizeSvg(browser, svg, width, height, { preview = false, requestedScale = 2, dpi = requestedScale * 96, signal } = {}) {
  signal?.throwIfAborted();
  const previewMaximum = Math.max(500, Number(process.env.PHYLORENDER_PREVIEW_MAX_DIMENSION) || 1600);
  const scale = preview ? Math.min(1, previewMaximum / Math.max(width, height)) : boundedPngScale(width, height, requestedScale);
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  const cancel = () => { void context.close().catch(() => undefined); };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    signal?.throwIfAborted();
    const page = await context.newPage();
    await page.addScriptTag({path:path.join(PROJECT_ROOT,"figure-units.js")});
    await page.addScriptTag({path:path.join(PROJECT_ROOT,"figure-contract.js")});
    await page.addScriptTag({path:path.join(PROJECT_ROOT,"render/png-raster.js")});
    const bytes = await page.evaluate(async input => {
      const result = await globalThis.PhyloRenderPngRaster.rasterize(input, {
        limits: globalThis.PhyloRenderContract.rasterization,
        createCanvas: () => document.createElement("canvas"), createImage: () => new Image(),
        createSource: text => URL.createObjectURL(new Blob([text], {type:"image/svg+xml;charset=utf-8"})),
        revokeSource: source => URL.revokeObjectURL(source), pngWithDpi: globalThis.PhyloRenderUnits.pngWithDpi,
      });
      return Array.from(result.bytes);
    }, {svg,width,height,scale,dpi:dpi*scale/requestedScale,
      maxPixels:Math.max(1000000,Number(process.env.PHYLORENDER_MAX_PNG_PIXELS)||contract.rasterization.maximumPixels)});
    return Buffer.from(bytes);
  } finally {
    signal?.removeEventListener("abort", cancel);
    await context.close();
  }
}

export class PhyloRenderRenderer {
  constructor(pageUrl, browser, launchBrowser = null) {
    this.pageUrl = pageUrl;
    const agentUrl = new URL(pageUrl);
    agentUrl.searchParams.set("phylorender-agent", "1");
    this.agentPageUrl = agentUrl.toString();
    this.browser = browser;
    this.launchBrowser = launchBrowser;
    this.queue = Promise.resolve();
    this.pending = 0;
    this.workerPage = null;
  }

  async ensureBrowser() {
    if (this.browser && typeof this.browser.isConnected === "function" && !this.browser.isConnected()) {
      this.workerPage = null;
      if (this.launchBrowser) {
        process.stderr.write("PhyloRender MCP: headless browser disconnected; relaunching...\n");
        this.browser = await this.launchBrowser();
      }
    }
    return this.browser;
  }

  serial(operation, { signal } = {}) {
    if (this.pending >= 8) return Promise.reject(Object.assign(new Error("Renderer queue is full; retry later."),
      { code: "SERVICE_BUSY", retryable: true }));
    this.pending++;
    const run = async () => { signal?.throwIfAborted(); return operation(); };
    const result = this.queue.then(run, run).finally(() => { this.pending--; });
    this.queue = result.catch(() => undefined);
    return result;
  }

  inspect(mainTree) {
    return this.serial(async () => {
      const browser = await this.ensureBrowser();
      const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });
      const timer = setTimeout(() => { void page.close().catch(() => undefined); }, 120_000);
      try {
        page.setDefaultTimeout(120_000);
        await page.goto(this.agentPageUrl, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => window.PhyloRenderAgent?.version);
        return await agentCall(page, "inspectTree", mainTree);
      } finally {
        clearTimeout(timer);
        await page.close();
      }
    });
  }

  render(spec, { signal, timeoutMs = 600_000, formats = ["svg", "png", "preview", "panels"] } = {}) {
    return this.serial(async () => {
      const controller = new AbortController();
      const nativeJobs = new Set();
      const cleanupPromises = new Map();
      const cancelNative = path => {
        if (cleanupPromises.has(path)) return cleanupPromises.get(path);
        const promise = (async () => {
        await fetch(new URL(`${path}/cancel`, this.pageUrl),
          { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(3000) });
        const deadline = Date.now() + 8000;
        while (Date.now() < deadline) {
          const response = await fetch(new URL(path, this.pageUrl), { signal: AbortSignal.timeout(3000) });
          const job = await response.json();
          if (!["running", "cancelling"].includes(job.status)) return;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw Object.assign(new Error("Native cleanup has not yet been confirmed; server lease remains active."), { code: "CLEANUP_PENDING" });
        })();
        cleanupPromises.set(path, promise);
        return promise;
      };
      const cancel = () => controller.abort(signal.reason || Object.assign(new Error("Render cancelled"), { code: "CANCELLED" }));
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) cancel();
      let timer;
      let activePage = null;
      const aborted = new Promise((_, reject) => {
        const onAbort = () => {
          for (const path of nativeJobs) void cancelNative(path).catch(() => undefined);
          void activePage?.close().catch(() => undefined);
          if (this.workerPage === activePage) this.workerPage = null;
          reject(controller.signal.reason);
        };
        controller.signal.addEventListener("abort", onAbort, { once: true });
        if (controller.signal.aborted) onAbort();
        timer = setTimeout(() => controller.abort(Object.assign(new Error("Render exceeded its total deadline."),
          { code: "DEADLINE_EXCEEDED", retryable: true })), timeoutMs);
      });
      const execute = async () => {
      controller.signal.throwIfAborted();
      await this.ensureBrowser();
      let page = this.workerPage;
      if (!page || page.isClosed()) {
        page = await this.browser.newPage({ viewport: { width: 1800, height: 1200 } });
        if (controller.signal.aborted) {
          await page.close().catch(() => undefined);
          controller.signal.throwIfAborted();
        }
        activePage = page;
        this.workerPage = page;
        page.setDefaultTimeout(180_000);
        await page.goto(this.agentPageUrl, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => window.PhyloRenderAgent?.version);
      }
      activePage = page;
      controller.signal.throwIfAborted();
      const collectJobs = async response => {
        const endpoint = new URL(response.url()).pathname;
        if (response.request().method() !== "POST" || !["/api/cloud-phyparts", "/api/cloud-date/jobs", "/api/taxon-names/jobs"].includes(endpoint)) return;
        try { const result = await response.json(); if (result.job) {
          const path = `${endpoint === "/api/cloud-phyparts" ? endpoint + "/jobs" : endpoint}/${result.job}`;
          nativeJobs.add(path); if (controller.signal.aborted) void cancelNative(path).catch(() => undefined);
        } } catch {}
      };
      page.on("response", collectJobs);
      try {
        const result = await agentCall(page, "loadFigure", spec, {includePanels:formats.includes("panels")});
        if (!result.report.topology_unchanged) throw new Error("Topology integrity check failed; export was stopped.");
        const width = Number(result.report.canvas.width);
        const height = Number(result.report.canvas.height);
        const maximumWidthMm = contract.maximumOutputWidthMm(spec.workspace || "phylogeny");
        const maximumCanvasWidth = globalThis.PhyloRenderUnits.designWidth;
        if (!Number.isFinite(width) || width > maximumCanvasWidth + .01) {
          throw Object.assign(new Error(`Renderer returned a canvas wider than the ${maximumWidthMm} mm ${spec.workspace || "phylogeny"} contract; publication was stopped.`),
            { code: "FIGURE_WIDTH_LIMIT_EXCEEDED", retryable: false });
        }
        const requestedDpi = Number(result.report.output.requested_dpi) || 300;
        const requestedPngScale = result.report.output.width_mm / width * requestedDpi / 25.4;
        const pngScale = boundedPngScale(width, height, requestedPngScale);
        const requestedFormats = new Set(formats);
        const panelTrees = requestedFormats.has("panels")
          ? await Promise.all((result.panel_trees || result.a4_print_pages || []).map(async printPage => ({
            pageNumber: Number(printPage.page_number),
            svg: printPage.svg,
            ...(requestedFormats.has("png") ? { png: await rasterizeSvg(
              this.browser,
              printPage.svg,
              Number(printPage.width) || 794,
              Number(printPage.height) || 1123,
              { requestedScale: result.report.output.width_mm / Number(printPage.width) * requestedDpi / 25.4, dpi: requestedDpi, signal: controller.signal },
            ) } : {}),
          }))) : [];
        const [png, preview] = await Promise.all([
          requestedFormats.has("png")
            ? rasterizeSvg(this.browser, result.svg, width, height, { requestedScale: requestedPngScale, dpi:requestedDpi, signal: controller.signal })
            : null,
          requestedFormats.has("preview")
            ? rasterizeSvg(this.browser, result.svg, width, height, { preview: true, signal: controller.signal })
            : null,
        ]);
        return {
          svg: result.svg,
          ...(png ? { png } : {}),
          ...(preview ? { preview } : {}),
          report: {
            ...result.report,
            output: {
              ...result.report.output,
              rasterization: {policy:pngRaster.policy, browser_version:this.browser.version(), surface:"software Canvas2D"},
              actual_png_scale: pngScale,
              effective_dpi: requestedDpi * pngScale / requestedPngScale,
              png_width: Math.round(width * pngScale),
              png_height: Math.round(height * pngScale),
            },
          },
          normalizedSpec: result.normalized_spec,
          pngScale,
          panelTrees,
        };
      } catch (error) {
        this.workerPage = null;
        await page.close().catch(() => undefined);
        throw error;
      } finally { page.off("response", collectJobs); }
      };
      try { return await Promise.race([execute(), aborted]); }
      catch (error) {
        const broken = this.workerPage; this.workerPage = null;
        await broken?.close().catch(() => undefined);
        const cleanup = await Promise.allSettled([...nativeJobs].map(cancelNative));
        if (cleanup.some(item => item.status === "rejected")) {
          error.trigger_code = error.code;
          error.code = "CLEANUP_PENDING";
          error.cleanup_pending = true;
          error.message = "Figure operation stopped, but native process cleanup is not yet confirmed; the server owner lease and native deadline remain active.";
        }
        throw error;
      }
      finally { clearTimeout(timer); signal?.removeEventListener("abort", cancel); }
    }, { signal });
  }
}

async function stopOwnedPageServer(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once("exit", resolve));
  if (child.stdin && !child.stdin.destroyed) child.stdin.end();
  else child.kill("SIGTERM");
  let timer;
  try {
    await Promise.race([exited, new Promise(resolve => { timer = setTimeout(resolve, 2000); })]);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await exited;
    }
  } finally { clearTimeout(timer); }
}

export async function createRuntime() {
  const pageServer = await startPhyloRenderPageServer();
  let browser;
  try {
  const executablePath = await findBrowserExecutable();
  const launchBrowser = () => chromium.launch({
    headless: true,
    executablePath,
    args: ["--font-render-hinting=none"],
  });
  browser = await launchBrowser();
  const renderer = new PhyloRenderRenderer(pageServer.url, browser, launchBrowser);
  return {
    renderer,
    pageUrl: pageServer.url,
    // Explicit demo URL for regression fixtures; the normal editor stays empty.
    demoPageUrl: (() => { const url = new URL(pageServer.url); url.searchParams.set("demo", "1"); return url.toString(); })(),
    browserExecutable: executablePath,
    async close() {
      await renderer.browser?.close().catch(() => undefined);
      await stopOwnedPageServer(pageServer.child);
    },
  };
  } catch (error) {
    await browser?.close().catch(() => undefined);
    await stopOwnedPageServer(pageServer.child);
    throw error;
  }
}

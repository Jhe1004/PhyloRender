import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import path from "node:path";

const canonical = value => Array.isArray(value) ? value.map(canonical) :
  value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const active = status => ["queued", "running", "cancelling"].includes(status);
const failure = (code, message, retryable = false) => Object.assign(new Error(message), { code, retryable });

// One registry per FigureStore, not per stateless HTTP MCP connection.
export class FigureJobs {
  constructor(directory, { limit = 8, retained = 64, ttlMs = 3_600_000 } = {}) {
    this.directory = directory; this.limit = limit; this.retained = retained; this.ttlMs = ttlMs;
    this.jobs = new Map(); this.controllers = new Map(); this.serial = Promise.resolve();
    this.ready = this.initialize();
  }
  async initialize() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    for (const name of await readdir(this.directory)) {
      if (!/^[0-9a-f-]{36}\.json$/.test(name)) continue;
      const job = JSON.parse(await readFile(path.join(this.directory, name), "utf8"));
      if (active(job.status)) {
        job.status = "failed"; job.finished_at = Date.now();
        job.error = { code: "PROCESS_INTERRUPTED", message: "Server stopped before completion; submit a new request key.", retryable: true };
        await this.save(job);
      }
      this.jobs.set(job.job_id, job);
    }
  }
  async save(job) {
    const target = path.join(this.directory, job.job_id + ".json");
    await writeFile(target + ".pending", JSON.stringify(job, null, 2), { mode: 0o600 });
    await rename(target + ".pending", target);
  }
  async start(spec, key, execute) {
    await this.ready;
    const operation = async () => {
      if (typeof key !== "string" || !key.trim() || key.length > 128)
        throw failure("INVALID_IDEMPOTENCY_KEY", "Provide a nonempty idempotency_key of at most 128 characters.");
      const keyHash = digest(key), requestHash = digest(spec);
      for (const [id, job] of this.jobs) {
        if (!active(job.status) && Date.now() - job.finished_at > this.ttlMs) {
          this.jobs.delete(id); await rm(path.join(this.directory, id + ".json"), { force: true });
        }
      }
      const prior = [...this.jobs.values()].find(job => job.key_hash === keyHash);
      if (prior) {
        if (prior.request_hash !== requestHash) throw failure("IDEMPOTENCY_CONFLICT", "This request key belongs to a different figure specification.");
        return this.public(prior);
      }
      if ([...this.jobs.values()].filter(job => active(job.status)).length >= this.limit || this.jobs.size >= this.retained)
        throw failure("SERVICE_BUSY", "Job capacity reached; retry later without changing the request key.", true);
      const job = { job_id: randomUUID(), status: "queued", created_at: Date.now(),
        key_hash: keyHash, request_hash: requestHash };
      const controller = new AbortController();
      this.jobs.set(job.job_id, job); this.controllers.set(job.job_id, controller);
      try { await this.save(job); } catch (error) { this.jobs.delete(job.job_id); this.controllers.delete(job.job_id); throw error; }
      setTimeout(() => { void this.run(job, execute, controller).catch(() => {
        process.stderr.write("PhyloRender job journal write failed; inspect storage permissions and disk capacity.\n");
      }); }, 0);
      return this.public(job);
    };
    const result = this.serial.then(operation, operation);
    this.serial = result.catch(() => undefined);
    return result;
  }
  async run(job, execute, controller) {
    try {
      controller.signal.throwIfAborted();
      job.status = "running"; await this.save(job);
      const result = await execute(controller.signal);
      // Successful atomic publication wins a concurrent late cancel.
      job.result = { figure_id: result.figureId, revision: result.revision };
      job.status = "succeeded";
    } catch (error) {
      job.status = controller.signal.aborted && !error.cleanup_pending ? "cancelled" : "failed";
      job.error = { code: error.code || "OPERATION_FAILED", message: error.message, retryable: error.retryable === true,
        ...(error.cleanup_pending ? { cleanup_pending: true, trigger_code: error.trigger_code || "CANCELLED" } : {}) };
    } finally {
      job.finished_at = Date.now(); this.controllers.delete(job.job_id);
      await this.save(job);
    }
  }
  public(job) {
    const { key_hash, request_hash, ...result } = job;
    return structuredClone(result);
  }
  async get(id) {
    await this.ready;
    const job = this.jobs.get(id);
    if (!job || (!active(job.status) && Date.now() - job.finished_at > this.ttlMs))
      throw failure("JOB_EXPIRED_OR_NOT_FOUND", "Job not found or retention period elapsed.");
    return this.public(job);
  }
  async cancel(id) {
    await this.ready;
    const job = this.jobs.get(id);
    if (!job) throw failure("JOB_EXPIRED_OR_NOT_FOUND", "Job not found.");
    const controller = this.controllers.get(id);
    if (controller) {
      job.status = "cancelling";
      controller.abort(failure("CANCELLED", "Cancelled by the client."));
    }
    // run() is the sole journal writer after start(), avoiding save races.
    return this.public(job);
  }
}

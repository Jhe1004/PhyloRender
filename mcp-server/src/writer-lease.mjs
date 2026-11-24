import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

// Fail closed on an existing lease, including a crash leftover. Never guess
// that a PID is dead/reusable or delete another process's lock automatically.
export async function acquireWriterLease(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, ".writer-lease.json"), nonce = randomUUID();
  let file;
  try { file = await open(target, "wx", 0o600); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    throw Object.assign(new Error("Output directory has an existing writer lease. Use the shared service or a separate output directory; after a crash, verify the recorded process before manually removing the stale lease."),
      { code: "OUTPUT_DIRECTORY_LOCKED", retryable: false });
  }
  try { await file.writeFile(JSON.stringify({ pid: process.pid, host: os.hostname(), nonce, started_at: new Date().toISOString() })); }
  finally { await file.close(); }
  let released = false;
  return async () => {
    if (released) return;
    const current = JSON.parse(await readFile(target, "utf8"));
    if (current.nonce !== nonce) throw new Error("Writer lease ownership changed; refusing to remove it.");
    await unlink(target); released = true;
  };
}

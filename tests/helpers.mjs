// Shared test helpers: run the compiled CLI in-process-like fashion via
// child_process against dist/cli.js, and manage per-test temp dirs.
// Everything is offline and deterministic.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const CLI = join(ROOT, "dist", "cli.js");

/** Run the CLI; returns { code, stdout, stderr }. */
export function runCli(args, { stdin } = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    input: stdin,
  });
  if (result.error) throw result.error;
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Create a temp dir that `t.after` cleans up; returns its path. */
export function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "crawlaw-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Write a robots.txt into `dir` and return its path. */
export function writeRobots(dir, text, name = "robots.txt") {
  const path = join(dir, name);
  writeFileSync(path, text);
  return path;
}

// CLI integration: the compiled binary run as a child process against
// freshly written temp files — exit codes, stdout/stderr split, stdin,
// JSON output and the audit gate.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { runCli, tempDir, writeRobots } from "./helpers.mjs";

const PUBLISHER = `User-agent: GPTBot
User-agent: CCBot
Disallow: /

User-agent: *
Disallow: /private/
`;

test("--version prints the package version; --help documents every subcommand", () => {
  const version = runCli(["--version"]);
  assert.equal(version.code, 0);
  assert.match(version.stdout, /^0\.1\.0\n$/);
  const help = runCli(["--help"]);
  assert.equal(help.code, 0);
  for (const word of ["check", "audit", "diff", "agents", "--require-blocked", "Exit codes"]) {
    assert.ok(help.stdout.includes(word), `help missing ${word}`);
  }
});

test("check: blocked exits 1 with proof on stdout, all-allowed exits 0", (t) => {
  const dir = tempDir(t);
  const file = writeRobots(dir, PUBLISHER);
  const { code, stdout } = runCli(["check", file, "--agent", "GPTBot", "/post/1"]);
  assert.equal(code, 1);
  assert.match(stdout, /BLOCKED {2}GPTBot {2}\/post\/1/);
  assert.match(stdout, /line 3/);
  const ok = runCli(["check", file, "--agent", "Googlebot", "/a", "/b"]);
  assert.equal(ok.code, 0);
  const mixed = runCli(["check", file, "--agent", "Googlebot", "/a", "/private/x"]);
  assert.equal(mixed.code, 1);
});

test("check: --format json emits one decision per path; - reads stdin", (t) => {
  const dir = tempDir(t);
  const file = writeRobots(dir, PUBLISHER);
  const { code, stdout } = runCli(["check", file, "--agent", "GPTBot", "/", "/a", "--format", "json"]);
  assert.equal(code, 1);
  const decisions = JSON.parse(stdout);
  assert.equal(decisions.length, 2);
  assert.equal(decisions[0].allowed, false);
  assert.equal(decisions[0].rule.line, 3);
  const stdin = runCli(["check", "-", "--agent", "GPTBot", "/x"], { stdin: PUBLISHER });
  assert.equal(stdin.code, 1);
  assert.match(stdin.stdout, /BLOCKED/);
});

test("usage errors exit 2: missing --agent, no paths, unreadable file, bad category", (t) => {
  const dir = tempDir(t);
  const file = writeRobots(dir, PUBLISHER);
  assert.equal(runCli(["check", file, "/x"]).code, 2);
  assert.equal(runCli(["check", file, "--agent", "GPTBot"]).code, 2);
  const missing = runCli(["check", `${dir}/nope.txt`, "--agent", "A", "/"]);
  assert.equal(missing.code, 2);
  assert.match(missing.stderr, /cannot read/);
  const badCat = runCli(["audit", file, "--category", "bots"]);
  assert.equal(badCat.code, 2);
  assert.match(badCat.stderr, /unknown category/);
});

test("parser warnings go to stderr, not stdout, and --quiet silences them", (t) => {
  const dir = tempDir(t);
  const file = writeRobots(dir, "Noindex: /x\nUser-agent: *\nDisallow: /private/\n");
  const noisy = runCli(["check", file, "--agent", "AnyBot", "/"]);
  assert.match(noisy.stderr, /warning: ignored: unknown directive/);
  assert.ok(!noisy.stdout.includes("warning"));
  const quiet = runCli(["check", file, "--agent", "AnyBot", "/", "--quiet"]);
  assert.equal(quiet.stderr, "");
});

test("audit: text report exits 0, includes category summaries, and is deterministic", (t) => {
  const dir = tempDir(t);
  const file = writeRobots(dir, PUBLISHER);
  const { code, stdout } = runCli(["audit", file]);
  assert.equal(code, 0);
  assert.match(stdout, /AI training — 2 of \d+ blocked/);
  assert.match(stdout, /GPTBot/);
  assert.equal(runCli(["audit", file]).stdout, stdout); // byte-identical rerun
});

test("audit: --require-blocked fails leaky files with exit 1, passes lockdowns with 0", (t) => {
  const dir = tempDir(t);
  const file = writeRobots(dir, PUBLISHER);
  const leaky = runCli(["audit", file, "--require-blocked", "ai-training"]);
  assert.equal(leaky.code, 1);
  assert.match(leaky.stderr, /gate failed/);
  assert.match(leaky.stderr, /ClaudeBot/); // allowed ai-training bot is named
  const lockdown = writeRobots(dir, "User-agent: *\nDisallow: /\n", "lockdown.txt");
  const pass = runCli(["audit", lockdown, "--require-blocked", "ai-training"]);
  assert.equal(pass.code, 0);
  assert.match(pass.stderr, /gate ok/);
});

test("audit: --format json is machine-readable and stable", (t) => {
  const dir = tempDir(t);
  const file = writeRobots(dir, PUBLISHER);
  const { stdout } = runCli(["audit", file, "--format", "json", "--category", "ai-training"]);
  const json = JSON.parse(stdout);
  assert.ok(json.bots.every((b) => b.category === "ai-training"));
  assert.ok(json.bots.find((b) => b.token === "GPTBot").verdict === "blocked");
});

test("diff: identical files exit 0, changed files exit 1", (t) => {
  const dir = tempDir(t);
  const a = writeRobots(dir, PUBLISHER, "a.txt");
  const b = writeRobots(dir, PUBLISHER, "b.txt");
  assert.equal(runCli(["diff", a, b]).code, 0);
  const c = writeRobots(dir, "User-agent: *\nDisallow: /\n", "c.txt");
  const changed = runCli(["diff", a, c]);
  assert.equal(changed.code, 1);
  assert.match(changed.stdout, /\d+ decisions changed:/);
});

test("diff: one side may be stdin, both may not", (t) => {
  const dir = tempDir(t);
  const a = writeRobots(dir, PUBLISHER, "a.txt");
  const viaStdin = runCli(["diff", a, "-"], { stdin: "User-agent: *\nAllow: /\n" });
  assert.equal(viaStdin.code, 1);
  const both = runCli(["diff", "-", "-"]);
  assert.equal(both.code, 2);
  assert.match(both.stderr, /only one side/);
});

test("agents: lists the registry, filters by category, emits stable JSON", () => {
  const all = runCli(["agents"]);
  assert.equal(all.code, 0);
  assert.match(all.stdout, /GPTBot\s+OpenAI/);
  const filtered = runCli(["agents", "--category", "ai-assistant"]);
  assert.ok(!filtered.stdout.includes("GPTBot"));
  assert.match(filtered.stdout, /Claude-User/);
  const bots = JSON.parse(runCli(["agents", "--format", "json"]).stdout);
  const gpt = bots.find((b) => b.token === "GPTBot");
  assert.equal(gpt.operator, "OpenAI");
  assert.equal(gpt.respectsRobots, "yes");
});

test("no args, unknown subcommands and unknown flags exit 2 with a message", () => {
  const none = runCli([]);
  assert.equal(none.code, 2);
  assert.equal(none.stdout, "");
  assert.match(none.stderr, /Usage:/);
  const cmd = runCli(["frobnicate"]);
  assert.equal(cmd.code, 2);
  assert.match(cmd.stderr, /unknown command/);
  const flag = runCli(["agents", "--bogus"]);
  assert.equal(flag.code, 2);
  assert.match(flag.stderr, /unknown option/);
});

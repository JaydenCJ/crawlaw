// Renderers: deterministic, grep-friendly text and stable JSON shapes.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  auditRobots,
  auditToJson,
  decisionToJson,
  diffRobots,
  evaluate,
  parseRobots,
  renderAudit,
  renderDecision,
  renderDiff,
  renderRegistry,
  renderWarnings,
  REGISTRY,
} from "../dist/index.js";

const ROBOTS = parseRobots("User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow: /private/\n");

test("renderDecision prints the verdict, token, path and the reason line", () => {
  const text = renderDecision(evaluate(ROBOTS, "GPTBot", "/post/1"));
  assert.match(text, /^BLOCKED {2}GPTBot {2}\/post\/1\n/);
  assert.match(text, /line 2/);
  const ok = renderDecision(evaluate(ROBOTS, "Googlebot", "/post/1"));
  assert.match(ok, /^ALLOWED {2}Googlebot/);
});

test("decisionToJson exposes the stable public shape", () => {
  const json = decisionToJson(evaluate(ROBOTS, "GPTBot", "/x"));
  assert.deepEqual(Object.keys(json).sort(), [
    "agent",
    "allowed",
    "basis",
    "matchedAgent",
    "path",
    "reason",
    "rule",
  ]);
  assert.deepEqual(json.rule, { kind: "disallow", pattern: "/", line: 2 });
  // Default-allow decisions carry rule: null, not a missing key.
  const none = decisionToJson(evaluate(parseRobots(""), "GPTBot", "/x"));
  assert.equal(none.rule, null);
});

test("renderAudit groups by category, shows blocked-of-total, and is deterministic", () => {
  const text = renderAudit(auditRobots(ROBOTS), "robots.txt");
  assert.match(text, /AI training — 1 of \d+ blocked/);
  assert.match(text, /GPTBot\s+OpenAI\s+blocked\s+explicit "gptbot" group \(line 1\)/);
  assert.match(text, /Traditional search — 0 of 2 blocked/);
  // Same input → byte-identical output; reports must be diff-able.
  assert.equal(text, renderAudit(auditRobots(ROBOTS), "robots.txt"));
});

test("renderAudit flags paper shields: blocked bots reported to ignore robots.txt", () => {
  const lockdown = auditRobots(parseRobots("User-agent: *\nDisallow: /\n"));
  const text = renderAudit(lockdown, "robots.txt");
  assert.match(text, /Perplexity-User.*blocked \(!\) ignores robots\.txt/);
  assert.match(text, /a robots\.txt rule is a request, not a lock/);
});

test("audit JSON carries per-bot decisions and the summary array", () => {
  const json = auditToJson(auditRobots(ROBOTS), "robots.txt");
  assert.equal(json.source, "robots.txt");
  assert.equal(json.bots.length, REGISTRY.length);
  const gpt = json.bots.find((b) => b.token === "GPTBot");
  assert.equal(gpt.verdict, "blocked");
  assert.equal(gpt.decisions[0].allowed, false);
});

test("renderDiff: plain no-changes line, or flips as before → after with both reasons", () => {
  const same = renderDiff(diffRobots(ROBOTS, ROBOTS), "a.txt", "b.txt");
  assert.match(same, /no behavioral changes/);
  const after = parseRobots("User-agent: *\nDisallow: /private/\n");
  const text = renderDiff(diffRobots(ROBOTS, after), "old", "new");
  assert.match(text, /\d+ decisions changed:/);
  assert.match(text, /blocked → allowed/);
  assert.match(text, /before: group "gptbot"/);
  assert.match(text, /- agent group "gptbot"/);
  // A single flip must read "1 decision changed", never "1 decisions".
  const one = renderDiff(
    diffRobots(parseRobots("User-agent: *\nDisallow: /$\n"), parseRobots("User-agent: *\nAllow: /$\n")),
    "old",
    "new"
  );
  assert.match(one, /^1 decision changed:$/m);
});

test("renderRegistry is one aligned row per bot with a header", () => {
  const text = renderRegistry(REGISTRY);
  const lines = text.split("\n");
  assert.equal(lines.length, REGISTRY.length + 1);
  assert.match(lines[0], /^token\s+operator\s+category\s+kind\s+robots\.txt$/);
  assert.ok(lines.some((l) => /^Bytespider\s+ByteDance\s+ai-training\s+crawler\s+partial$/.test(l)));
});

test("renderWarnings uses the file:line: warning: format editors understand", () => {
  const robots = parseRobots("Disallow: /early\n");
  const text = renderWarnings(robots.warnings, "robots.txt");
  assert.match(text, /^robots\.txt:1: warning: /);
});

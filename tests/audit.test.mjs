// The audit engine: verdict classification (blocked/allowed/partial),
// the explicit/wildcard/default provenance that tells a site owner *why*
// a bot has access, per-category summaries, and the CI gate.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { auditRobots, gateViolations, parseRobots, REGISTRY } from "../dist/index.js";

const BLOCK_AI = `User-agent: GPTBot
User-agent: ClaudeBot
User-agent: CCBot
User-agent: Bytespider
Disallow: /

User-agent: *
Disallow: /drafts/
`;

function row(result, token) {
  const r = result.rows.find((x) => x.bot.token === token);
  assert.ok(r, `${token} missing from audit`);
  return r;
}

test("explicitly disallowed bots are verdict=blocked via=explicit", () => {
  const result = auditRobots(parseRobots(BLOCK_AI));
  for (const token of ["GPTBot", "ClaudeBot", "CCBot", "Bytespider"]) {
    const r = row(result, token);
    assert.equal(r.verdict, "blocked", token);
    assert.equal(r.via, "explicit", token);
  }
});

test("provenance: `*`-governed bots are via=wildcard, no groups at all is via=default", () => {
  const result = auditRobots(parseRobots(BLOCK_AI));
  const r = row(result, "PerplexityBot");
  assert.equal(r.verdict, "allowed"); // "/" is not under /drafts/
  assert.equal(r.via, "wildcard");
  const empty = auditRobots(parseRobots("# empty policy\n"));
  for (const e of empty.rows) {
    assert.equal(e.verdict, "allowed");
    assert.equal(e.via, "default");
  }
});

test("partial verdict: blocked on some audited paths, allowed on others", () => {
  const robots = parseRobots("User-agent: GPTBot\nDisallow: /archive/\n");
  const result = auditRobots(robots, { paths: ["/", "/archive/2020"] });
  const r = row(result, "GPTBot");
  assert.equal(r.verdict, "partial");
  assert.deepEqual(r.decisions.map((d) => d.allowed), [true, false]);
});

test("the default audit path is exactly /", () => {
  const result = auditRobots(parseRobots(BLOCK_AI));
  assert.deepEqual(result.paths, ["/"]);
  assert.equal(row(result, "GPTBot").decisions.length, 1);
});

test("summary counts blocked-of-total per category; the category filter narrows both", () => {
  const result = auditRobots(parseRobots(BLOCK_AI));
  const training = result.summary.find((s) => s.category === "ai-training");
  const totalTraining = REGISTRY.filter((b) => b.category === "ai-training").length;
  assert.equal(training.total, totalTraining);
  assert.equal(training.blocked, 4); // GPTBot, ClaudeBot, CCBot, Bytespider
  const filtered = auditRobots(parseRobots(BLOCK_AI), { categories: ["ai-assistant"] });
  assert.ok(filtered.rows.every((r) => r.bot.category === "ai-assistant"));
  assert.deepEqual(filtered.summary.map((s) => s.category), ["ai-assistant"]);
});

test("gateViolations lists not-fully-blocked bots of the gated category only", () => {
  const result = auditRobots(parseRobots(BLOCK_AI));
  const violations = gateViolations(result, "ai-training");
  const tokens = violations.map((v) => v.bot.token);
  assert.ok(!tokens.includes("GPTBot"));
  assert.ok(tokens.includes("Google-Extended")); // allowed → violation
  assert.ok(violations.every((v) => v.bot.category === "ai-training"));
});

test("a full lockdown (Disallow: / for *) blocks every crawler in every category", () => {
  const result = auditRobots(parseRobots("User-agent: *\nDisallow: /\n"));
  assert.ok(result.rows.every((r) => r.verdict === "blocked"));
  assert.deepEqual(gateViolations(result, "ai-training"), []);
  for (const s of result.summary) assert.equal(s.blocked, s.total);
});

test("prefix subtlety: a group for GPTBot does not govern the shorter token GPT", () => {
  const robots = parseRobots("User-agent: GPTBot\nDisallow: /\n");
  const result = auditRobots(robots, {
    bots: [
      { token: "GPT", operator: "x", category: "ai-training", kind: "crawler", respectsRobots: "yes", note: "synthetic test bot" },
    ],
  });
  assert.equal(result.rows[0].verdict, "allowed");
  assert.equal(result.rows[0].via, "default");
});

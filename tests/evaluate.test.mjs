// The evaluator end to end: decisions carry the verdict AND the proof —
// matched group, winning rule, line numbers, and a human reason.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { evaluate, evaluateAll, parseRobots } from "../dist/index.js";

const PUBLISHER = `# example publisher policy
User-agent: GPTBot
User-agent: CCBot
Disallow: /

User-agent: *
Disallow: /private/
Allow: /private/annual-report.pdf
`;

test("an explicitly blocked bot is blocked everywhere, with line-number proof", () => {
  const robots = parseRobots(PUBLISHER);
  const d = evaluate(robots, "GPTBot", "/articles/2026/how-it-works");
  assert.equal(d.allowed, false);
  assert.equal(d.matchedAgent, "gptbot");
  assert.equal(d.basis, "rule");
  assert.equal(d.rule.line, 4);
  assert.deepEqual(d.groupLines, [2]);
  assert.match(d.reason, /group "gptbot" \(line 2\)/);
  assert.match(d.reason, /disallow: \/" \(line 4\)/);
});

test("an unnamed bot falls through to `*`, where a longer allow carves an exception", () => {
  const robots = parseRobots(PUBLISHER);
  assert.equal(evaluate(robots, "SomeBot", "/private/x").allowed, false);
  assert.equal(evaluate(robots, "SomeBot", "/public").allowed, true);
  const d = evaluate(robots, "SomeBot", "/private/annual-report.pdf");
  assert.equal(d.allowed, true);
  assert.equal(d.rule.kind, "allow");
});

test("basis distinguishes rule, no-rule and no-group outcomes", () => {
  const robots = parseRobots("User-agent: GPTBot\nDisallow: /a\n");
  assert.equal(evaluate(robots, "GPTBot", "/a/x").basis, "rule");
  assert.equal(evaluate(robots, "GPTBot", "/b").basis, "no-rule");
  assert.equal(evaluate(robots, "OtherBot", "/a/x").basis, "no-group");
  // All three non-rule outcomes are allows, including an empty file.
  assert.equal(evaluate(robots, "GPTBot", "/b").allowed, true);
  assert.equal(evaluate(robots, "OtherBot", "/a/x").allowed, true);
  assert.equal(evaluate(parseRobots(""), "GPTBot", "/").basis, "no-group");
  assert.equal(evaluate(parseRobots(""), "GPTBot", "/").allowed, true);
});

test("evaluate accepts a full User-Agent header and a full URL as inputs", () => {
  const robots = parseRobots("User-agent: GPTBot\nDisallow: /\n");
  const d = evaluate(
    robots,
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2)",
    "/"
  );
  assert.equal(d.allowed, false);
  assert.equal(d.agentToken, "GPTBot");
  const robots2 = parseRobots("User-agent: *\nDisallow: /private/\n");
  const d2 = evaluate(robots2, "AnyBot", "https://example.test/private/x?id=1");
  assert.equal(d2.allowed, false);
  assert.equal(d2.path, "/private/x?id=1");
});

test("percent-encoding differences between rule and URL do not defeat the rule", () => {
  const robots = parseRobots("User-agent: *\nDisallow: /caf%c3%a9/\n");
  assert.equal(evaluate(robots, "AnyBot", "/caf%C3%A9/menu").allowed, false);
});

test("rules split across two groups for the same token combine before deciding", () => {
  const robots = parseRobots(
    "User-agent: GPTBot\nDisallow: /\n\nUser-agent: GPTBot\nAllow: /press/\n"
  );
  assert.equal(evaluate(robots, "GPTBot", "/press/release").allowed, true);
  assert.equal(evaluate(robots, "GPTBot", "/anything-else").allowed, false);
});

test("evaluateAll preserves path order and evaluates each independently", () => {
  const robots = parseRobots("User-agent: *\nDisallow: /b\n");
  const ds = evaluateAll(robots, "AnyBot", ["/a", "/b", "/c"]);
  assert.deepEqual(ds.map((d) => d.allowed), [true, false, true]);
  assert.deepEqual(ds.map((d) => d.path), ["/a", "/b", "/c"]);
});

test("the classic footgun: Disallow: / with a later Allow: /$ keeps only the homepage open", () => {
  const robots = parseRobots("User-agent: *\nDisallow: /\nAllow: /$\n");
  assert.equal(evaluate(robots, "AnyBot", "/").allowed, true);
  assert.equal(evaluate(robots, "AnyBot", "/anything").allowed, false);
});

// User-agent group selection: product-token extraction from full UA
// headers, case-insensitive longest-prefix matching, group combination,
// and the `*` fallback — the semantics of RFC 9309 §2.2.1 as implemented
// by the major crawlers.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { namedAgents, parseRobots, productToken, selectGroups } from "../dist/index.js";

test("productToken: bare names, token/version pairs, and full UA headers", () => {
  assert.equal(productToken("GPTBot"), "GPTBot");
  assert.equal(productToken("GPTBot/1.2"), "GPTBot");
  assert.equal(
    productToken("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://example.test/gptbot)"),
    "GPTBot"
  );
  assert.equal(productToken("Mozilla/5.0 (compatible; Bytespider; spider-feedback@example.test)"), "Bytespider");
  assert.equal(productToken("  ClaudeBot  "), "ClaudeBot");
  assert.equal(productToken(""), "");
});

test("matching is case-insensitive and prefix-based (googlebot ⊂ Googlebot-News)", () => {
  const robots = parseRobots("User-agent: gptbot\nDisallow: /\n");
  assert.equal(selectGroups(robots, "GPTBot").matched, "gptbot");
  const robots2 = parseRobots("User-agent: GPTBOT\nDisallow: /\n");
  assert.equal(selectGroups(robots2, "gptbot").matched, "gptbot");
  const robots3 = parseRobots("User-agent: Googlebot\nDisallow: /news-rules\n");
  assert.equal(selectGroups(robots3, "Googlebot-News").matched, "googlebot");
});

test("the most specific (longest) matching value wins", () => {
  const robots = parseRobots(
    "User-agent: Googlebot\nDisallow: /a\n\nUser-agent: Googlebot-News\nDisallow: /b\n"
  );
  assert.equal(selectGroups(robots, "Googlebot-News").matched, "googlebot-news");
  assert.equal(selectGroups(robots, "Googlebot-Image").matched, "googlebot");
});

test("the crawler token being a prefix of the group value does NOT match", () => {
  // A site that names "GPTBot-Extra" has said nothing about GPTBot.
  const robots = parseRobots("User-agent: GPTBot-Extra\nDisallow: /\nUser-agent: *\nAllow: /\n");
  assert.equal(selectGroups(robots, "GPTBot").matched, "*");
});

test("all groups carrying the winning value are combined (RFC 9309 MUST)", () => {
  const robots = parseRobots(
    "User-agent: GPTBot\nDisallow: /a\n\nUser-agent: GPTBot\nDisallow: /b\n"
  );
  const sel = selectGroups(robots, "GPTBot");
  assert.equal(sel.groups.length, 2);
  const rules = sel.groups.flatMap((g) => g.rules).map((r) => r.raw);
  assert.deepEqual(rules, ["/a", "/b"]);
});

test("`*` applies only when no named group matched", () => {
  const robots = parseRobots(
    "User-agent: GPTBot\nDisallow: /gpt\n\nUser-agent: *\nDisallow: /all\n"
  );
  assert.equal(selectGroups(robots, "GPTBot").matched, "gptbot");
  assert.equal(selectGroups(robots, "SomeOtherBot").matched, "*");
});

test("no group at all: selection is empty and matched is null", () => {
  const robots = parseRobots("User-agent: GPTBot\nDisallow: /\n");
  const sel = selectGroups(robots, "UnrelatedBot");
  assert.equal(sel.matched, null);
  assert.deepEqual(sel.groups, []);
});

test("namedAgents lists distinct non-wildcard tokens, sorted", () => {
  const robots = parseRobots(
    "User-agent: ZBot\nUser-agent: ABot\nDisallow: /\nUser-agent: *\nDisallow: /x\nUser-agent: abot\nAllow: /\n"
  );
  assert.deepEqual(namedAgents(robots), ["abot", "zbot"]);
});

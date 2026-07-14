// Parser semantics: RFC 9309 group building, tolerated misspellings,
// comments, BOM, sitemaps, crawl-delay, and the warning stream. The
// parser must never throw — malformed input degrades to warnings.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseRobots } from "../dist/index.js";

test("a minimal file parses into one group with one rule", () => {
  const robots = parseRobots("User-agent: GPTBot\nDisallow: /private/\n");
  assert.equal(robots.groups.length, 1);
  const group = robots.groups[0];
  assert.deepEqual(group.agents.map((a) => a.token), ["gptbot"]);
  assert.equal(group.rules.length, 1);
  assert.deepEqual(group.rules[0], { kind: "disallow", pattern: "/private/", raw: "/private/", line: 2 });
});

test("consecutive user-agent lines share the rules that follow", () => {
  const robots = parseRobots("User-agent: GPTBot\nUser-agent: CCBot\nDisallow: /\n");
  assert.equal(robots.groups.length, 1);
  assert.deepEqual(robots.groups[0].agents.map((a) => a.token), ["gptbot", "ccbot"]);
});

test("a user-agent line after rules starts a new group", () => {
  const robots = parseRobots(
    "User-agent: GPTBot\nDisallow: /a\nUser-agent: CCBot\nDisallow: /b\n"
  );
  assert.equal(robots.groups.length, 2);
  assert.equal(robots.groups[0].rules[0].raw, "/a");
  assert.equal(robots.groups[1].rules[0].raw, "/b");
});

test("rules before any user-agent line are ignored with a warning", () => {
  const robots = parseRobots("Disallow: /secret\nUser-agent: *\nDisallow: /x\n");
  assert.equal(robots.groups.length, 1);
  assert.equal(robots.groups[0].rules.length, 1);
  assert.ok(robots.warnings.some((w) => w.line === 1 && /no group/.test(w.message)));
});

test("comments run from # to end of line; whole-line comments vanish", () => {
  const robots = parseRobots(
    "# banner\nUser-agent: * # everyone\nDisallow: /tmp/ # scratch\n"
  );
  assert.equal(robots.groups[0].agents[0].token, "*");
  assert.equal(robots.groups[0].rules[0].raw, "/tmp/");
  assert.equal(robots.warnings.length, 0);
});

test("byte-level tolerance: a UTF-8 BOM, CRLF and lone-CR endings all parse", () => {
  const bom = parseRobots("﻿User-agent: *\nDisallow: /\n");
  assert.equal(bom.groups.length, 1);
  assert.equal(bom.groups[0].agents[0].token, "*");
  for (const eol of ["\r\n", "\r"]) {
    const robots = parseRobots(`User-agent: *${eol}Disallow: /a${eol}Allow: /a/b${eol}`);
    assert.equal(robots.groups[0].rules.length, 2, `eol=${JSON.stringify(eol)}`);
  }
});

test("tolerance: misspellings map to canonical directives, junk lines warn and skip", () => {
  const robots = parseRobots("Useragent: Foo\nDissallow: /a\nCrawldelay: 5\n");
  assert.equal(robots.groups.length, 1);
  assert.equal(robots.groups[0].rules[0].kind, "disallow");
  assert.equal(robots.groups[0].crawlDelay.seconds, 5);
  assert.ok(robots.warnings.some((w) => /non-standard spelling/.test(w.message)));
  const junk = parseRobots("User-agent: *\nNoindex: /x\njust some text\nDisallow: /y\n");
  assert.equal(junk.groups[0].rules.length, 1);
  assert.ok(junk.warnings.some((w) => /unknown directive "Noindex"/.test(w.message)));
  assert.ok(junk.warnings.some((w) => /no ":" separator/.test(w.message)));
});

test('empty patterns: "Disallow:" is the silent allow-all idiom, empty Allow warns', () => {
  const disallow = parseRobots("User-agent: *\nDisallow:\n");
  assert.equal(disallow.groups[0].rules.length, 0);
  assert.equal(disallow.warnings.length, 0);
  const allow = parseRobots("User-agent: *\nAllow:\n");
  assert.equal(allow.groups[0].rules.length, 0);
  assert.ok(allow.warnings.some((w) => /empty allow/.test(w.message)));
});

test("a pattern without a leading slash is repaired to /pattern with a warning", () => {
  const robots = parseRobots("User-agent: *\nDisallow: admin/\n");
  assert.equal(robots.groups[0].rules[0].pattern, "/admin/");
  assert.ok(robots.warnings.some((w) => /does not start with "\/"/.test(w.message)));
});

test("non-rule directives: sitemaps are file-wide, crawl-delay is validated per group", () => {
  const robots = parseRobots(
    "Sitemap: https://example.test/a.xml\nUser-agent: *\nDisallow: /\nSitemap: https://example.test/b.xml\n"
  );
  assert.deepEqual(robots.sitemaps.map((s) => s.url), [
    "https://example.test/a.xml",
    "https://example.test/b.xml",
  ]);
  assert.deepEqual(robots.sitemaps.map((s) => s.line), [1, 4]);
  // Crawl-delay: non-numeric is dropped, duplicates keep the first.
  const cd = parseRobots("User-agent: *\nCrawl-delay: fast\nCrawl-delay: 2\nCrawl-delay: 9\n");
  assert.equal(cd.groups[0].crawlDelay.seconds, 2);
  assert.ok(cd.warnings.some((w) => /not a number/.test(w.message)));
  assert.ok(cd.warnings.some((w) => /duplicate crawl-delay/.test(w.message)));
});

test("odd user-agent values: duplicates deduplicate, non-tokens parse with a warning", () => {
  const dup = parseRobots("User-agent: GPTBot\nUser-agent: gptbot\nDisallow: /\n");
  assert.equal(dup.groups[0].agents.length, 1);
  assert.ok(dup.warnings.some((w) => /duplicate user-agent/.test(w.message)));
  const weird = parseRobots("User-agent: Mozilla/5.0 weird\nDisallow: /\n");
  assert.equal(weird.groups.length, 1);
  assert.ok(weird.warnings.some((w) => /not a product token/.test(w.message)));
});

test("empty input and whitespace-only input yield an empty file", () => {
  for (const text of ["", "   \n\n  \n", "# only comments\n"]) {
    const robots = parseRobots(text);
    assert.deepEqual(robots.groups, []);
    assert.deepEqual(robots.sitemaps, []);
  }
});

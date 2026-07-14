// The semantic differ: probe derivation from patterns, decision flips per
// agent, wildcard-baseline handling, structural changes, and the
// identical-files fast path.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { diffRobots, parseRobots, probesForFile, probesForPattern } from "../dist/index.js";

function diff(beforeText, afterText, options) {
  return diffRobots(parseRobots(beforeText), parseRobots(afterText), options);
}

test("probesForPattern covers prefixes, wildcard interiors and anchors", () => {
  // Plain prefix: the pattern itself plus one step past it.
  assert.deepEqual(probesForPattern("/private/").sort(), ["/private/", "/private/x"]);
  // Wildcards become representative segments, plus the literal prefix.
  const probes = probesForPattern("/downloads/*.zip");
  assert.ok(probes.includes("/downloads/x.zip"));
  assert.ok(probes.includes("/downloads/"));
  // An anchored pattern gets no past-the-end probe.
  assert.deepEqual(probesForPattern("/page$"), ["/page"]);
});

test("probesForFile always includes / and deduplicates across groups", () => {
  const robots = parseRobots("User-agent: A\nDisallow: /x\nUser-agent: B\nDisallow: /x\n");
  assert.deepEqual(probesForFile(robots), ["/", "/x", "/xx"]);
});

test("identical files and cosmetic edits (comments, spacing, case) report no changes", () => {
  const text = "User-agent: *\nDisallow: /private/\nSitemap: https://example.test/s.xml\n";
  const result = diff(text, text);
  assert.equal(result.identical, true);
  assert.deepEqual(result.changes, []);
  const before = "User-agent: GPTBot\nDisallow: /private/\n";
  const after = "# tightened 2026\nUSER-AGENT: gptbot\n\ndisallow:   /private/\n";
  assert.equal(diff(before, after).identical, true);
});

test("adding an AI-bot block reports the flip for that agent, not for others", () => {
  const before = "User-agent: *\nDisallow: /drafts/\n";
  const after = "User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow: /drafts/\n";
  const result = diff(before, after);
  assert.ok(result.changes.length > 0);
  assert.ok(result.changes.every((c) => c.agent === "gptbot"));
  const root = result.changes.find((c) => c.path === "/");
  assert.equal(root.before, true);
  assert.equal(root.after, false);
  assert.match(root.afterReason, /disallow: \/ \(line 2\)/);
  assert.deepEqual(result.agentsAdded, ["gptbot"]);
});

test("an explicit agent inherits the `*` group on the side where it has no group", () => {
  // Before: GPTBot falls under "*" (blocked from /private/). After: GPTBot
  // has its own empty-disallow group → /private/ becomes reachable.
  const before = "User-agent: *\nDisallow: /private/\n";
  const after = "User-agent: GPTBot\nDisallow:\n\nUser-agent: *\nDisallow: /private/\n";
  const result = diff(before, after);
  const flips = result.changes.filter((c) => c.agent === "gptbot");
  assert.ok(flips.some((c) => c.path === "/private/x" && c.before === false && c.after === true));
});

test("the `*` baseline row tracks changes for bots not named on either side", () => {
  const before = "User-agent: *\nDisallow: /a/\n";
  const after = "User-agent: *\nDisallow: /a/\nDisallow: /b/\n";
  const result = diff(before, after);
  const change = result.changes.find((c) => c.agent === "*" && c.path === "/b/");
  assert.ok(change);
  assert.equal(change.before, true);
  assert.equal(change.after, false);
});

test("anchor edits surface via the past-the-end probe", () => {
  const before = "User-agent: *\nDisallow: /page\n";
  const after = "User-agent: *\nDisallow: /page$\n";
  const result = diff(before, after);
  const past = result.changes.find((c) => c.path === "/pagex");
  assert.ok(past, "expected /pagex to flip");
  assert.equal(past.before, false);
  assert.equal(past.after, true);
});

test("sitemap additions and removals are structural changes but not decision flips", () => {
  const before = "User-agent: *\nDisallow: /x\nSitemap: https://example.test/old.xml\n";
  const after = "User-agent: *\nDisallow: /x\nSitemap: https://example.test/new.xml\n";
  const result = diff(before, after);
  assert.deepEqual(result.changes, []);
  assert.deepEqual(result.sitemapsAdded, ["https://example.test/new.xml"]);
  assert.deepEqual(result.sitemapsRemoved, ["https://example.test/old.xml"]);
  assert.equal(result.identical, false);
});

test("options: agents restricts the comparison, extra paths join the probe set", () => {
  const before = "User-agent: *\nAllow: /\n";
  const after = "User-agent: GPTBot\nDisallow: /\n\nUser-agent: CCBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n";
  const result = diff(before, after, { agents: ["GPTBot"] });
  assert.ok(result.changes.every((c) => c.agent === "gptbot"));
  assert.ok(result.changes.length > 0);
  const paths = diff("User-agent: *\nDisallow: /\n", "User-agent: *\nDisallow: /\nAllow: /rss\n", {
    paths: ["/rss.xml"],
  });
  assert.ok(paths.probes.includes("/rss.xml"));
  assert.ok(paths.changes.find((c) => c.path === "/rss.xml"), "custom probe should register the flip");
});

test("removing every rule flips previously blocked probes back to allowed", () => {
  const before = "User-agent: *\nDisallow: /private/\n";
  const result = diff(before, "");
  const flip = result.changes.find((c) => c.agent === "*" && c.path === "/private/x");
  assert.ok(flip);
  assert.equal(flip.after, true);
  assert.match(flip.afterReason, /no matching group/);
});

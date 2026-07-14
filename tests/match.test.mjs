// Path matching per RFC 9309 §2.2.2/§2.2.3: wildcard `*`, end anchor `$`,
// longest-match-wins, allow-wins-ties, and percent-encoding equivalence.
// These are the cases sites get wrong most often.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  canonicalizeEncoding,
  decide,
  matchesPattern,
  normalizePath,
  specificity,
} from "../dist/index.js";

test("a plain pattern is a prefix match", () => {
  assert.ok(matchesPattern("/private/", "/private/report.html"));
  assert.ok(matchesPattern("/private/", "/private/"));
  assert.ok(!matchesPattern("/private/", "/private")); // shorter than the pattern
  assert.ok(!matchesPattern("/private/", "/public/private/")); // anchored at start
});

test("`*` matches any run of characters, including none", () => {
  assert.ok(matchesPattern("/*.pdf", "/whitepaper.pdf"));
  assert.ok(matchesPattern("/*.pdf", "/.pdf")); // zero-width star
  assert.ok(matchesPattern("/a/*/c", "/a/b/c"));
  assert.ok(matchesPattern("/a/*/c", "/a//c"));
  assert.ok(!matchesPattern("/a/*/c", "/a/b/d"));
});

test("multiple wildcards match segments in order, greedily but correctly", () => {
  assert.ok(matchesPattern("/*/download/*.zip", "/files/download/build.zip"));
  assert.ok(!matchesPattern("/*/download/*.zip", "/files/downloads/build.tar"));
  // the second segment must appear after the first match position
  assert.ok(matchesPattern("/a*b*c", "/aXbYc"));
  assert.ok(!matchesPattern("/a*b*c", "/acb"));
});

test("`$` anchors only at the very end of the pattern", () => {
  assert.ok(matchesPattern("/page$", "/page"));
  assert.ok(!matchesPattern("/page$", "/pages"));
  assert.ok(matchesPattern("/*.php$", "/index.php"));
  assert.ok(!matchesPattern("/*.php$", "/index.php?x=1"));
  // `$` elsewhere is a literal character
  assert.ok(matchesPattern("/pri$ce", "/pri$ce-list"));
  // `/$` allows exactly the root and nothing else — the homepage-only idiom.
  assert.ok(matchesPattern("/$", "/"));
  assert.ok(!matchesPattern("/$", "/anything"));
  // Trailing `*$` behaves like an unanchored trailing `*`.
  assert.ok(matchesPattern("/dir/*$", "/dir/x"));
  assert.ok(matchesPattern("/dir/*$", "/dir/"));
});

test("percent-encoding: hex case unified, unreserved decoded, junk kept literally", () => {
  assert.equal(canonicalizeEncoding("/caf%c3%a9"), "/caf%C3%A9");
  assert.equal(canonicalizeEncoding("/%7Euser"), "/~user");
  assert.equal(canonicalizeEncoding("/a%2Fb"), "/a%2Fb"); // %2F stays encoded
  // Invalid escapes must not throw — they match byte-for-byte instead.
  assert.equal(canonicalizeEncoding("/100%"), "/100%");
  assert.equal(canonicalizeEncoding("/%G1x"), "/%G1x");
});

test("normalizePath reduces full URLs to their path; both sides canonicalize", () => {
  assert.equal(normalizePath("https://example.test/a/b?q=1"), "/a/b?q=1");
  assert.equal(normalizePath("https://example.test"), "/");
  assert.equal(normalizePath(""), "/");
  assert.equal(normalizePath("post/1"), "/post/1");
  // Differently-cased escapes in rule and URL still match each other.
  assert.ok(matchesPattern(canonicalizeEncoding("/caf%c3%a9"), normalizePath("/caf%C3%A9")));
});

test("decide: the longest matching pattern wins regardless of rule order", () => {
  const rules = [
    { kind: "disallow", pattern: "/", raw: "/", line: 1 },
    { kind: "allow", pattern: "/public/", raw: "/public/", line: 2 },
  ];
  assert.equal(decide(rules, "/public/page").kind, "allow");
  assert.equal(decide(rules, "/private/page").kind, "disallow");
  // Same result with the rules reversed: order must not matter.
  assert.equal(decide([...rules].reverse(), "/public/page").kind, "allow");
});

test("decide: on an exact specificity tie, allow beats disallow", () => {
  const rules = [
    { kind: "disallow", pattern: "/folder/", raw: "/folder/", line: 1 },
    { kind: "allow", pattern: "/folder$", raw: "/folder$", line: 2 },
  ];
  // Both patterns are 8 octets; only disallow matches /folder/x though.
  assert.equal(decide(rules, "/folder/x").kind, "disallow");
  const tie = [
    { kind: "disallow", pattern: "/page", raw: "/page", line: 1 },
    { kind: "allow", pattern: "/page", raw: "/page", line: 2 },
  ];
  assert.equal(decide(tie, "/page").kind, "allow");
});

test("decide: no matching rule returns null (default allow)", () => {
  const rules = [{ kind: "disallow", pattern: "/private/", raw: "/private/", line: 1 }];
  assert.equal(decide(rules, "/public"), null);
  assert.equal(decide([], "/anything"), null);
});

test("specificity is octets: multibyte literals count fully, wildcards count once", () => {
  assert.equal(specificity("/abc"), 4);
  assert.equal(specificity("/日本"), 7); // 1 + 3 + 3
  // "/a*" and "/ab" are both 3 octets → tie → allow wins.
  const rules = [
    { kind: "disallow", pattern: "/a*", raw: "/a*", line: 1 },
    { kind: "allow", pattern: "/ab", raw: "/ab", line: 2 },
  ];
  assert.equal(decide(rules, "/ab").kind, "allow");
});

// The embedded registry: structural invariants that keep audit output
// trustworthy — unique tokens, valid categories, honest control-token
// entries, and lookup helpers.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { botsInCategory, CATEGORIES, findBot, isCategory, REGISTRY } from "../dist/index.js";

test("tokens are unique case-insensitively and valid robots.txt product tokens", () => {
  const seen = new Set();
  for (const bot of REGISTRY) {
    const key = bot.token.toLowerCase();
    assert.ok(!seen.has(key), `duplicate token ${bot.token}`);
    seen.add(key);
    // "." appears in archive.org_bot; RFC-strict tokens plus that one
    // real-world exception, which robots.txt files do name literally.
    assert.match(bot.token, /^[a-zA-Z0-9_.-]+$/, bot.token);
  }
});

test("every entry is fully populated with a valid category and compliance value", () => {
  for (const bot of REGISTRY) {
    assert.ok(bot.token.length > 0);
    assert.ok(bot.operator.length > 0);
    assert.ok(bot.note.length > 10, `${bot.token} needs a real note`);
    assert.ok(CATEGORIES.includes(bot.category), `${bot.token}: bad category`);
    assert.ok(["yes", "partial", "no"].includes(bot.respectsRobots));
    assert.ok(["crawler", "control-token"].includes(bot.kind));
  }
});

test("the headline AI bots of the 2026 blocking fight are all present", () => {
  for (const token of [
    "GPTBot",
    "ClaudeBot",
    "CCBot",
    "Google-Extended",
    "Bytespider",
    "PerplexityBot",
    "ChatGPT-User",
    "Meta-ExternalAgent",
  ]) {
    assert.ok(findBot(token) !== null, `${token} missing from registry`);
  }
});

test("control-token entries are exactly the documented non-fetching switches", () => {
  const controls = REGISTRY.filter((b) => b.kind === "control-token").map((b) => b.token).sort();
  assert.deepEqual(controls, ["Applebot-Extended", "Google-Extended"]);
  for (const token of controls) {
    assert.match(findBot(token).note, /Not a fetcher/);
  }
});

test("bots documented as ignoring robots.txt carry an explanatory note", () => {
  const ignorers = REGISTRY.filter((b) => b.respectsRobots === "no");
  assert.ok(ignorers.length >= 2); // Perplexity-User, Meta-ExternalFetcher
  for (const bot of ignorers) {
    assert.ok(bot.category === "ai-assistant", `${bot.token}: only on-demand fetchers claim this`);
  }
});

test("findBot is case-insensitive and returns null for strangers", () => {
  assert.equal(findBot("gptbot").token, "GPTBot");
  assert.equal(findBot("GPTBOT").token, "GPTBot");
  assert.equal(findBot("NoSuchBot"), null);
});

test("botsInCategory partitions the registry; isCategory knows exactly five names", () => {
  const total = CATEGORIES.reduce((n, c) => n + botsInCategory(c).length, 0);
  assert.equal(total, REGISTRY.length);
  assert.ok(botsInCategory("ai-training").length >= 10, "training list should be substantial");
  for (const c of CATEGORIES) assert.ok(isCategory(c));
  assert.ok(!isCategory("ai"));
  assert.ok(!isCategory(""));
  assert.ok(!isCategory("AI-TRAINING")); // callers lowercase first
});

/**
 * The AI-crawler audit: run every registry bot through the evaluator and
 * classify the result, so a site owner gets one table proving what their
 * robots.txt actually permits.
 */

import { evaluateAll } from "./evaluate.js";
import { CATEGORIES, REGISTRY } from "./registry.js";
import type {
  AuditResult,
  AuditRow,
  AuditVerdict,
  BotCategory,
  BotInfo,
  RobotsFile,
} from "./types.js";

export interface AuditOptions {
  /** Paths to evaluate for every bot; defaults to `["/"]`. */
  paths?: readonly string[];
  /** Restrict the audit to these categories; defaults to all. */
  categories?: readonly BotCategory[];
  /** Override the bot list entirely (used by tests). */
  bots?: readonly BotInfo[];
}

/** Audit a parsed robots.txt against the embedded registry. */
export function auditRobots(robots: RobotsFile, options: AuditOptions = {}): AuditResult {
  const paths = options.paths !== undefined && options.paths.length > 0 ? [...options.paths] : ["/"];
  const wanted = options.categories !== undefined && options.categories.length > 0
    ? new Set(options.categories)
    : new Set(CATEGORIES);
  const bots = (options.bots ?? REGISTRY).filter((b) => wanted.has(b.category));

  const rows: AuditRow[] = bots.map((bot) => {
    const decisions = evaluateAll(robots, bot.token, paths);
    const blockedCount = decisions.filter((d) => !d.allowed).length;
    const verdict: AuditVerdict =
      blockedCount === decisions.length ? "blocked" : blockedCount === 0 ? "allowed" : "partial";
    // Via: how the verdict was reached. If any path matched an explicit
    // group, the site named this bot; a pure-"*" outcome is incidental.
    const via = decisions.some((d) => d.matchedAgent !== null && d.matchedAgent !== "*")
      ? "explicit"
      : decisions.some((d) => d.matchedAgent === "*")
        ? "wildcard"
        : "default";
    return { bot, verdict, decisions, via };
  });

  const summary = CATEGORIES.filter((c) => wanted.has(c))
    .map((category) => {
      const inCat = rows.filter((r) => r.bot.category === category);
      return {
        category,
        blocked: inCat.filter((r) => r.verdict === "blocked").length,
        total: inCat.length,
      };
    })
    .filter((s) => s.total > 0);

  return { paths, rows, summary };
}

/**
 * The audit rows that violate a policy gate: bots in `category` that are
 * not fully blocked. Drives the CLI's `--require-blocked` CI gate.
 */
export function gateViolations(result: AuditResult, category: BotCategory): AuditRow[] {
  return result.rows.filter((r) => r.bot.category === category && r.verdict !== "blocked");
}

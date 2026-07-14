/**
 * The evaluator: RobotsFile + agent + path → Decision.
 *
 * This is the piece that answers "may this bot fetch this URL, and can
 * you prove it?" — every decision carries the matched group, the winning
 * rule, its line number, and a one-sentence reason.
 */

import { productToken, selectGroups } from "./agents.js";
import { decide, normalizePath } from "./match.js";
import type { Decision, Group, RobotsFile, Rule } from "./types.js";

/** Evaluate one agent against one path. */
export function evaluate(robots: RobotsFile, agent: string, path: string): Decision {
  const normalized = normalizePath(path);
  const token = productToken(agent);
  const selection = selectGroups(robots, agent);
  const partial = decideForGroups(selection.groups, normalized);
  const groupLines = selection.groups.map((g) => g.line);

  if (selection.matched === null) {
    return {
      allowed: true,
      agent,
      agentToken: token,
      path: normalized,
      matchedAgent: null,
      groupLines,
      rule: null,
      basis: "no-group",
      reason: `no group matches "${token}" and there is no "*" group — allowed by default`,
    };
  }

  const label = selection.matched === "*" ? `the "*" group` : `group "${selection.matched}"`;
  const at = `line ${groupLines.join(", ")}`;

  if (partial.rule === null) {
    return {
      allowed: true,
      agent,
      agentToken: token,
      path: normalized,
      matchedAgent: selection.matched,
      groupLines,
      rule: null,
      basis: "no-rule",
      reason: `${label} (${at}) matches but none of its rules cover ${normalized} — allowed by default`,
    };
  }

  return {
    allowed: partial.rule.kind === "allow",
    agent,
    agentToken: token,
    path: normalized,
    matchedAgent: selection.matched,
    groupLines,
    rule: partial.rule,
    basis: "rule",
    reason:
      `${label} (${at}), rule "${partial.rule.kind}: ${partial.rule.raw}" ` +
      `(line ${partial.rule.line}) is the longest match`,
  };
}

/**
 * Decide a path against an already-selected set of groups.
 * Exposed for the differ, which iterates group values directly.
 */
export function decideForGroups(groups: readonly Group[], normalizedPath: string): { rule: Rule | null } {
  const rules: Rule[] = [];
  for (const g of groups) rules.push(...g.rules);
  return { rule: decide(rules, normalizedPath) };
}

/** Convenience: evaluate several paths at once, in input order. */
export function evaluateAll(robots: RobotsFile, agent: string, paths: readonly string[]): Decision[] {
  return paths.map((p) => evaluate(robots, agent, p));
}

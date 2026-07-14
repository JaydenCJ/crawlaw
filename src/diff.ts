/**
 * Semantic policy diffing.
 *
 * A textual diff of two robots.txt files tells you which lines changed; it
 * does not tell you whether GPTBot may suddenly fetch your archive. The
 * differ answers the second question: it derives a set of *probe paths*
 * from every rule pattern on either side, evaluates every governed agent
 * (each explicitly named token, plus the `*` baseline) against every probe
 * in both files, and reports each decision that flipped.
 *
 * Probes are derived, not guessed: for a pattern like `/private/*` the
 * differ tests `/private/x` (inside the pattern) and `/private/` (its
 * literal prefix), so wildcard and anchor changes surface too.
 */

import { namedAgents, groupsWithValue } from "./agents.js";
import { decideForGroups } from "./evaluate.js";
import { normalizePath } from "./match.js";
import type { DecisionChange, DiffResult, Group, RobotsFile } from "./types.js";

/** Turn one rule pattern into concrete probe paths that exercise it. */
export function probesForPattern(pattern: string): string[] {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const probes = new Set<string>();
  // The pattern with every wildcard replaced by a representative segment.
  probes.add(body.split("*").join("x") || "/");
  // The literal prefix up to the first wildcard: tests the boundary.
  const star = body.indexOf("*");
  if (star > 0) probes.add(body.slice(0, star));
  if (!anchored) {
    // One step past the pattern: catches `$`-anchor additions/removals.
    probes.add(body.split("*").join("x") + "x");
  }
  return [...probes].map((p) => normalizePath(p));
}

/** All probe paths for a file: every rule pattern, expanded and deduplicated. */
export function probesForFile(robots: RobotsFile): string[] {
  const probes = new Set<string>(["/"]);
  for (const group of robots.groups) {
    for (const rule of group.rules) {
      for (const p of probesForPattern(rule.pattern)) probes.add(p);
    }
  }
  return [...probes].sort();
}

/** Sitemap URL lists, order-insensitive. */
function sitemapSet(robots: RobotsFile): Set<string> {
  return new Set(robots.sitemaps.map((s) => s.url));
}

function describe(groups: readonly Group[], matched: string | null, path: string): {
  allowed: boolean;
  reason: string;
} {
  if (matched === null) return { allowed: true, reason: "no matching group (default allow)" };
  const { rule } = decideForGroups(groups, path);
  if (rule === null) {
    return { allowed: true, reason: `group "${matched}": no rule covers the path (default allow)` };
  }
  return {
    allowed: rule.kind === "allow",
    reason: `group "${matched}": ${rule.kind}: ${rule.raw} (line ${rule.line})`,
  };
}

/**
 * Selection for the diff: for an explicit token use its groups on that
 * side, falling back to the side's `*` groups; the `"*"` agent label means
 * "any bot not named explicitly" and only ever uses the `*` groups.
 */
function sideSelection(robots: RobotsFile, agentLabel: string): { groups: Group[]; matched: string | null } {
  if (agentLabel !== "*") {
    const explicit = groupsWithValue(robots, agentLabel);
    if (explicit.length > 0) return { groups: explicit, matched: agentLabel };
  }
  const wildcard = groupsWithValue(robots, "*");
  if (wildcard.length > 0) return { groups: wildcard, matched: "*" };
  return { groups: [], matched: null };
}

export interface DiffOptions {
  /** Restrict the comparison to these agent tokens (case-insensitive). */
  agents?: readonly string[];
  /** Extra probe paths to evaluate on top of the derived ones. */
  paths?: readonly string[];
}

/** Compare two parsed robots.txt files semantically. */
export function diffRobots(before: RobotsFile, after: RobotsFile, options: DiffOptions = {}): DiffResult {
  const beforeAgents = namedAgents(before);
  const afterAgents = namedAgents(after);

  let agents: string[];
  if (options.agents !== undefined && options.agents.length > 0) {
    agents = [...new Set(options.agents.map((a) => a.toLowerCase()))].sort();
  } else {
    agents = [...new Set([...beforeAgents, ...afterAgents, "*"])].sort();
  }

  const probes = new Set<string>([...probesForFile(before), ...probesForFile(after)]);
  for (const p of options.paths ?? []) probes.add(normalizePath(p));
  const probeList = [...probes].sort();

  const changes: DecisionChange[] = [];
  for (const agent of agents) {
    const selBefore = sideSelection(before, agent);
    const selAfter = sideSelection(after, agent);
    for (const path of probeList) {
      const b = describe(selBefore.groups, selBefore.matched, path);
      const a = describe(selAfter.groups, selAfter.matched, path);
      if (b.allowed !== a.allowed) {
        changes.push({
          agent,
          path,
          before: b.allowed,
          after: a.allowed,
          beforeReason: b.reason,
          afterReason: a.reason,
        });
      }
    }
  }

  const beforeSet = new Set(beforeAgents);
  const afterSet = new Set(afterAgents);
  const agentsAdded = afterAgents.filter((a) => !beforeSet.has(a));
  const agentsRemoved = beforeAgents.filter((a) => !afterSet.has(a));

  const smBefore = sitemapSet(before);
  const smAfter = sitemapSet(after);
  const sitemapsAdded = [...smAfter].filter((s) => !smBefore.has(s)).sort();
  const sitemapsRemoved = [...smBefore].filter((s) => !smAfter.has(s)).sort();

  const identical =
    changes.length === 0 &&
    agentsAdded.length === 0 &&
    agentsRemoved.length === 0 &&
    sitemapsAdded.length === 0 &&
    sitemapsRemoved.length === 0;

  return { changes, agentsAdded, agentsRemoved, sitemapsAdded, sitemapsRemoved, probes: probeList, identical };
}

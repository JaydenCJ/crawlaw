/**
 * User-agent group selection per RFC 9309 §2.2.1, with the longest-match
 * refinement every major crawler implements.
 *
 * - The crawler's identity is its *product token* (`GPTBot`, not the full
 *   `Mozilla/5.0 (...; GPTBot/1.2; ...)` header). `productToken()`
 *   extracts it from either form.
 * - A group matches when its user-agent value is a case-insensitive
 *   prefix of the crawler's token — this is how `Googlebot-News` obeys a
 *   `googlebot` group. The most specific (longest) matching value wins.
 * - Every group carrying the winning value is combined into one rule set
 *   (RFC 9309: "the matching groups' rules MUST be combined").
 * - The `*` group applies only when no named group matched.
 */

import type { Group, RobotsFile } from "./types.js";

const TOKEN_CHARS = /[a-zA-Z0-9_-]/;

/**
 * Extract the product token from an agent string.
 *
 * Accepts a bare token (`GPTBot`), a token/version pair (`GPTBot/1.2`) or
 * a full User-Agent header — for headers, the token inside a
 * `(compatible; Token/...)` comment wins over the leading `Mozilla`,
 * because that is the token operators document for robots.txt.
 */
export function productToken(agent: string): string {
  const s = agent.trim();
  if (s === "") return "";
  // Full UA header with a compatible-comment: prefer the comment token.
  const compat = /\bcompatible[;,]\s*([a-zA-Z0-9_-]+)/i.exec(s);
  if (compat !== null) return compat[1] as string;
  // Otherwise: the leading run of token characters.
  let end = 0;
  while (end < s.length && TOKEN_CHARS.test(s[end] as string)) end++;
  return s.slice(0, end);
}

export interface GroupSelection {
  /** All groups whose user-agent value is the winning value. */
  groups: Group[];
  /** The winning user-agent value, lowercased (`"gptbot"`, `"*"`), or null. */
  matched: string | null;
}

/**
 * Select the groups that govern `agent` in `robots`.
 *
 * Returns the combined named groups for the longest matching value, the
 * combined `*` groups when no named value matches, or an empty selection
 * (→ default allow) when the file has neither.
 */
export function selectGroups(robots: RobotsFile, agent: string): GroupSelection {
  const token = productToken(agent).toLowerCase();
  let bestValue: string | null = null;
  if (token !== "") {
    for (const group of robots.groups) {
      for (const a of group.agents) {
        if (a.token === "*") continue;
        if (!token.startsWith(a.token)) continue;
        if (bestValue === null || a.token.length > bestValue.length) {
          bestValue = a.token;
        }
      }
    }
  }
  if (bestValue !== null) {
    return { groups: groupsWithValue(robots, bestValue), matched: bestValue };
  }
  const wildcard = groupsWithValue(robots, "*");
  if (wildcard.length > 0) return { groups: wildcard, matched: "*" };
  return { groups: [], matched: null };
}

/** All groups that carry a given (lowercased) user-agent value. */
export function groupsWithValue(robots: RobotsFile, value: string): Group[] {
  return robots.groups.filter((g) => g.agents.some((a) => a.token === value));
}

/** Every distinct named (non-`*`) user-agent value in the file, sorted. */
export function namedAgents(robots: RobotsFile): string[] {
  const seen = new Set<string>();
  for (const group of robots.groups) {
    for (const a of group.agents) {
      if (a.token !== "*") seen.add(a.token);
    }
  }
  return [...seen].sort();
}

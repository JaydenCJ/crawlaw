/**
 * Path matching per RFC 9309 §2.2.2 and §2.2.3.
 *
 * - `*` matches any run of characters (including none).
 * - `$` at the very end of a pattern anchors the match to the end of the
 *   path; anywhere else it is a literal dollar sign.
 * - The most specific matching rule wins, measured as the length in
 *   octets of the (normalized) pattern. On a tie between an allow and a
 *   disallow rule, the allow rule wins ("least restrictive" per the RFC).
 * - Percent-encodings are canonicalized on both sides before matching so
 *   `/caf%c3%a9` and `/caf%C3%A9` compare equal, and `%2F` stays distinct
 *   from a literal `/`.
 */

import type { Rule } from "./types.js";

const UNRESERVED = /^[A-Za-z0-9\-._~]$/;

/**
 * Canonicalize percent-encodings in a path or pattern:
 * - `%XX` that decodes to an unreserved character is decoded, so
 *   `/%7Euser` and `/~user` compare equal;
 * - every other valid `%XX` keeps its encoding but uppercases the hex,
 *   so `%2f` and `%2F` compare equal while staying distinct from `/`;
 * - an invalid escape (`%G1`, trailing `%`) is left byte-for-byte alone,
 *   matching the "be liberal in what you accept" stance of the RFC.
 */
export function canonicalizeEncoding(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (ch !== "%") {
      out += ch;
      continue;
    }
    const hex = text.slice(i + 1, i + 3);
    if (!/^[0-9a-fA-F]{2}$/.test(hex)) {
      out += ch; // invalid escape: literal percent
      continue;
    }
    const decoded = String.fromCharCode(parseInt(hex, 16));
    if (UNRESERVED.test(decoded)) {
      out += decoded;
    } else {
      out += "%" + hex.toUpperCase();
    }
    i += 2;
  }
  return out;
}

/** Normalize a request path: guarantee a leading `/`, canonicalize escapes. */
export function normalizePath(path: string): string {
  let p = path.trim();
  if (p === "") p = "/";
  // Accept full URLs for convenience: keep only path + query.
  const urlish = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/]*(\/.*)?$/.exec(p);
  if (urlish) p = urlish[1] ?? "/";
  if (!p.startsWith("/")) p = "/" + p;
  return canonicalizeEncoding(p);
}

/** Normalize a rule pattern: guarantee `/` or `*` start, canonicalize escapes. */
export function normalizePattern(pattern: string): string {
  let p = pattern.trim();
  if (!p.startsWith("/") && !p.startsWith("*")) p = "/" + p;
  return canonicalizeEncoding(p);
}

/**
 * Match a normalized pattern against a normalized path.
 *
 * Implemented as greedy segment search rather than a compiled RegExp so
 * that hostile patterns can neither inject metacharacters nor trigger
 * pathological backtracking: each literal segment is located at most once,
 * left to right, which is linear in `path.length`.
 */
export function matchesPattern(pattern: string, path: string): boolean {
  let pat = pattern;
  let anchored = false;
  if (pat.endsWith("$")) {
    anchored = true;
    pat = pat.slice(0, -1);
    // "$" alone (or "*$") still behaves as an anchored wildcard match.
  }
  const segments = pat.split("*");
  // First segment must match at the start of the path.
  const first = segments[0] as string;
  if (!path.startsWith(first)) return false;
  let pos = first.length;
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i] as string;
    if (seg === "") {
      // consecutive or trailing "*": matches anything, including nothing
      if (i === segments.length - 1) pos = path.length;
      continue;
    }
    if (i === segments.length - 1 && anchored) {
      // Last literal segment with a `$` anchor: must match at the end.
      const at = path.length - seg.length;
      if (at < pos) return false;
      return path.endsWith(seg);
    }
    const at = path.indexOf(seg, pos);
    if (at === -1) return false;
    pos = at + seg.length;
  }
  if (anchored) return pos === path.length;
  return true;
}

/** Specificity of a pattern: its length in octets (RFC 9309 §2.2.2). */
export function specificity(pattern: string): number {
  // Patterns are ASCII after canonicalization in practice; measure UTF-8
  // octets anyway so multibyte literals rank the way the RFC says.
  let octets = 0;
  for (const ch of pattern) {
    const cp = ch.codePointAt(0) as number;
    octets += cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4;
  }
  return octets;
}

/**
 * Pick the winning rule for a path from a group's rules.
 * Returns `null` when no rule matches (→ allowed by default).
 */
export function decide(rules: readonly Rule[], path: string): Rule | null {
  let best: Rule | null = null;
  let bestScore = -1;
  for (const rule of rules) {
    if (!matchesPattern(rule.pattern, path)) continue;
    const score = specificity(rule.pattern);
    if (
      score > bestScore ||
      (score === bestScore && rule.kind === "allow" && best !== null && best.kind === "disallow")
    ) {
      best = rule;
      bestScore = score;
    }
  }
  return best;
}

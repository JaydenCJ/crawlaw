/**
 * RFC 9309 robots.txt parser.
 *
 * Parsing never throws: malformed lines produce warnings and are skipped,
 * exactly the way production crawlers behave. The parser also accepts the
 * common misspellings that the large crawlers accept (`useragent`,
 * `dissallow`, `crawldelay`, …) so an audit reflects what actually happens
 * in the wild, while still warning so the author can fix the file.
 */

import { normalizePattern } from "./match.js";
import type { Group, ParseWarning, RobotsFile, Rule } from "./types.js";

/** Directive-name spellings accepted in the wild, mapped to canonical names. */
const DIRECTIVE_ALIASES: Record<string, string> = {
  "user-agent": "user-agent",
  useragent: "user-agent",
  "user agent": "user-agent",
  allow: "allow",
  disallow: "disallow",
  dissallow: "disallow",
  disalow: "disallow",
  sitemap: "sitemap",
  "site-map": "sitemap",
  "crawl-delay": "crawl-delay",
  crawldelay: "crawl-delay",
};

const CANONICAL = new Set(["user-agent", "allow", "disallow", "sitemap", "crawl-delay"]);

/** Product tokens are letters, digits, `-` and `_` (RFC 9309 §2.2.1). */
const TOKEN_RE = /^[a-zA-Z0-9_-]+$/;

interface Line {
  no: number;
  name: string; //     canonical directive name, or "" for unrecognized
  rawName: string;
  value: string;
}

function splitLines(text: string): { no: number; text: string }[] {
  // Strip a UTF-8 BOM; robots.txt served with one is common.
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return body.split(/\r\n|\r|\n/).map((t, i) => ({ no: i + 1, text: t }));
}

function parseLine(no: number, raw: string, warnings: ParseWarning[]): Line | null {
  // Comments run from the first `#` to the end of the line.
  const hash = raw.indexOf("#");
  const text = (hash === -1 ? raw : raw.slice(0, hash)).trim();
  if (text === "") return null;
  const colon = text.indexOf(":");
  if (colon === -1) {
    warnings.push({ line: no, message: `ignored: no ":" separator in "${clip(text)}"` });
    return null;
  }
  const rawName = text.slice(0, colon).trim();
  const value = text.slice(colon + 1).trim();
  const canonical = DIRECTIVE_ALIASES[rawName.toLowerCase()];
  if (canonical === undefined) {
    warnings.push({ line: no, message: `ignored: unknown directive "${clip(rawName)}"` });
    return null;
  }
  if (canonical !== rawName.toLowerCase() && !CANONICAL.has(rawName.toLowerCase())) {
    warnings.push({
      line: no,
      message: `non-standard spelling "${clip(rawName)}" read as "${canonical}"`,
    });
  }
  return { no, name: canonical, rawName, value };
}

function clip(s: string): string {
  return s.length > 40 ? s.slice(0, 37) + "..." : s;
}

/**
 * Parse robots.txt text into groups, sitemaps and warnings.
 *
 * Group semantics per RFC 9309 §2.2.1: consecutive `User-agent` lines
 * start a group and share the rules that follow; a `User-agent` line
 * after rules starts a new group; rules that appear before any
 * `User-agent` line belong to no group and are ignored (with a warning).
 */
export function parseRobots(text: string): RobotsFile {
  const warnings: ParseWarning[] = [];
  const groups: Group[] = [];
  const sitemaps: { url: string; line: number }[] = [];

  let current: Group | null = null;
  // True while we are collecting consecutive user-agent lines for a group
  // that has not seen a rule yet.
  let collectingAgents = false;

  for (const { no, text: rawLine } of splitLines(text)) {
    const line = parseLine(no, rawLine, warnings);
    if (line === null) continue;

    if (line.name === "sitemap") {
      // Sitemap is a non-group directive: valid anywhere in the file.
      if (line.value === "") {
        warnings.push({ line: no, message: "ignored: empty sitemap URL" });
      } else {
        sitemaps.push({ url: line.value, line: no });
      }
      continue;
    }

    if (line.name === "user-agent") {
      const raw = line.value;
      if (raw === "") {
        warnings.push({ line: no, message: "ignored: empty user-agent value" });
        continue;
      }
      const token = raw.toLowerCase();
      if (token !== "*" && !TOKEN_RE.test(raw)) {
        warnings.push({
          line: no,
          message: `user-agent "${clip(raw)}" is not a product token (letters, digits, "-", "_"); matched as written`,
        });
      }
      if (!collectingAgents) {
        current = { agents: [], rules: [], line: no };
        groups.push(current);
        collectingAgents = true;
      }
      const dup = (current as Group).agents.some((a) => a.token === token);
      if (dup) {
        warnings.push({ line: no, message: `duplicate user-agent "${clip(raw)}" in the same group` });
      } else {
        (current as Group).agents.push({ token, raw, line: no });
      }
      continue;
    }

    // Everything below is a group member.
    collectingAgents = false;
    if (current === null) {
      warnings.push({
        line: no,
        message: `ignored: "${line.rawName}" before any user-agent line belongs to no group`,
      });
      continue;
    }

    if (line.name === "allow" || line.name === "disallow") {
      if (line.value === "") {
        // An empty pattern matches nothing; `Disallow:` (empty) is the
        // historical idiom for "allow everything". Both are no-ops.
        if (line.name === "allow") {
          warnings.push({ line: no, message: "empty allow pattern matches nothing" });
        }
        continue;
      }
      if (!line.value.startsWith("/") && !line.value.startsWith("*")) {
        warnings.push({
          line: no,
          message: `pattern "${clip(line.value)}" does not start with "/" — read as "/${clip(line.value)}"`,
        });
      }
      const rule: Rule = {
        kind: line.name,
        pattern: normalizePattern(line.value),
        raw: line.value,
        line: no,
      };
      current.rules.push(rule);
      continue;
    }

    if (line.name === "crawl-delay") {
      const seconds = Number(line.value);
      if (!Number.isFinite(seconds) || seconds < 0) {
        warnings.push({ line: no, message: `ignored: crawl-delay "${clip(line.value)}" is not a number` });
        continue;
      }
      if (current.crawlDelay !== undefined) {
        warnings.push({ line: no, message: "duplicate crawl-delay in group; first one kept" });
        continue;
      }
      current.crawlDelay = { seconds, line: no };
      continue;
    }
  }

  return { groups, sitemaps, warnings };
}

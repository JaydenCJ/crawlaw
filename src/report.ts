/**
 * Renderers: turn engine values into terminal text or stable JSON.
 *
 * Text output is aligned, deterministic and free of color codes so it can
 * be grepped, diffed and pasted into an issue. JSON shapes are considered
 * public API from 0.1.0 on: fields are only ever added, never renamed.
 */

import { CATEGORY_LABELS } from "./registry.js";
import type { AuditResult, Decision, DiffResult, BotInfo, ParseWarning } from "./types.js";

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function table(rows: string[][], indent = "  "): string {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, cell.length);
    });
  }
  return rows
    .map((row) => indent + row.map((cell, i) => (i === row.length - 1 ? cell : pad(cell, widths[i] as number))).join("  ").trimEnd())
    .join("\n");
}

// ---- check ------------------------------------------------------------

export function renderDecision(decision: Decision): string {
  const verdict = decision.allowed ? "ALLOWED" : "BLOCKED";
  return `${verdict}  ${decision.agentToken}  ${decision.path}\n          ${decision.reason}`;
}

export function renderDecisions(decisions: readonly Decision[]): string {
  return decisions.map(renderDecision).join("\n");
}

export function decisionToJson(decision: Decision): Record<string, unknown> {
  return {
    agent: decision.agentToken,
    path: decision.path,
    allowed: decision.allowed,
    matchedAgent: decision.matchedAgent,
    basis: decision.basis,
    rule:
      decision.rule === null
        ? null
        : { kind: decision.rule.kind, pattern: decision.rule.raw, line: decision.rule.line },
    reason: decision.reason,
  };
}

// ---- audit ------------------------------------------------------------

/**
 * Flag a verdict whose enforcement is doubtful: a "blocked" that the bot
 * is reported to ignore is a paper shield, and the reader should know.
 * Allowed bots get no mark — compliance is moot when the door is open.
 */
function complianceMark(bot: BotInfo, verdict: string): string {
  if (verdict === "allowed") return "";
  if (bot.respectsRobots === "no") return " (!) ignores robots.txt";
  if (bot.respectsRobots === "partial") return " (!) compliance disputed";
  return "";
}

export function renderAudit(result: AuditResult, source: string): string {
  const lines: string[] = [];
  const pathLabel = result.paths.join(", ");
  lines.push(`crawlaw audit — ${source} — ${result.rows.length} known bots, path ${pathLabel}`);
  for (const summary of result.summary) {
    const label = CATEGORY_LABELS[summary.category];
    lines.push("");
    lines.push(`${label} — ${summary.blocked} of ${summary.total} blocked`);
    const rows: string[][] = [["bot", "operator", "verdict", "how"]];
    for (const row of result.rows.filter((r) => r.bot.category === summary.category)) {
      const first = row.decisions[0] as Decision;
      const how =
        row.via === "default"
          ? "no group matches (default allow)"
          : row.verdict === "partial"
            ? `${row.via} rules; ${row.decisions.filter((d) => !d.allowed).length} of ${row.decisions.length} paths blocked`
            : row.via === "explicit"
              ? `explicit ${first.matchedAgent === null ? "" : `"${first.matchedAgent}" `}group (line ${first.groupLines.join(", ")})`
              : `"*" group (line ${first.groupLines.join(", ")})`;
      rows.push([row.bot.token, row.bot.operator, row.verdict + complianceMark(row.bot, row.verdict), how]);
    }
    lines.push(table(rows));
  }
  const caveats = result.rows.filter((r) => r.verdict === "blocked" && r.bot.respectsRobots !== "yes");
  if (caveats.length > 0) {
    lines.push("");
    lines.push("note: a robots.txt rule is a request, not a lock —");
    for (const row of caveats) {
      lines.push(`  ${row.bot.token}: ${row.bot.note}`);
    }
  }
  return lines.join("\n");
}

export function auditToJson(result: AuditResult, source: string): Record<string, unknown> {
  return {
    source,
    paths: result.paths,
    summary: result.summary.map((s) => ({ ...s })),
    bots: result.rows.map((row) => ({
      token: row.bot.token,
      operator: row.bot.operator,
      category: row.bot.category,
      kind: row.bot.kind,
      respectsRobots: row.bot.respectsRobots,
      verdict: row.verdict,
      via: row.via,
      decisions: row.decisions.map(decisionToJson),
    })),
  };
}

// ---- diff -------------------------------------------------------------

export function renderDiff(result: DiffResult, beforeName: string, afterName: string): string {
  const lines: string[] = [];
  lines.push(`crawlaw diff — ${beforeName} → ${afterName} (${result.probes.length} probe paths)`);
  if (result.identical) {
    lines.push("");
    lines.push("no behavioral changes: every probed agent/path decision is identical");
    return lines.join("\n");
  }
  if (result.changes.length > 0) {
    lines.push("");
    const n = result.changes.length;
    lines.push(`${n} decision${n === 1 ? "" : "s"} changed:`);
    const rows: string[][] = [];
    for (const c of result.changes) {
      const arrow = `${c.before ? "allowed" : "blocked"} → ${c.after ? "allowed" : "blocked"}`;
      const agent = c.agent === "*" ? "* (any other bot)" : c.agent;
      rows.push([agent, c.path, arrow]);
    }
    lines.push(table(rows));
    lines.push("");
    for (const c of result.changes) {
      lines.push(`  ${c.agent} ${c.path}`);
      lines.push(`    before: ${c.beforeReason}`);
      lines.push(`    after:  ${c.afterReason}`);
    }
  }
  const structural: string[] = [];
  for (const a of result.agentsAdded) structural.push(`+ agent group "${a}"`);
  for (const a of result.agentsRemoved) structural.push(`- agent group "${a}"`);
  for (const s of result.sitemapsAdded) structural.push(`+ sitemap ${s}`);
  for (const s of result.sitemapsRemoved) structural.push(`- sitemap ${s}`);
  if (structural.length > 0) {
    lines.push("");
    lines.push("structural changes:");
    for (const s of structural) lines.push("  " + s);
  }
  return lines.join("\n");
}

export function diffToJson(result: DiffResult, beforeName: string, afterName: string): Record<string, unknown> {
  return {
    before: beforeName,
    after: afterName,
    identical: result.identical,
    probes: result.probes,
    changes: result.changes.map((c) => ({ ...c })),
    agentsAdded: result.agentsAdded,
    agentsRemoved: result.agentsRemoved,
    sitemapsAdded: result.sitemapsAdded,
    sitemapsRemoved: result.sitemapsRemoved,
  };
}

// ---- agents (registry listing) ----------------------------------------

export function renderRegistry(bots: readonly BotInfo[]): string {
  const rows: string[][] = [["token", "operator", "category", "kind", "robots.txt"]];
  for (const bot of bots) {
    rows.push([bot.token, bot.operator, bot.category, bot.kind, bot.respectsRobots]);
  }
  return table(rows, "");
}

export function registryToJson(bots: readonly BotInfo[]): Record<string, unknown>[] {
  return bots.map((b) => ({ ...b }));
}

// ---- warnings ---------------------------------------------------------

export function renderWarnings(warnings: readonly ParseWarning[], source: string): string {
  return warnings.map((w) => `${source}:${w.line}: warning: ${w.message}`).join("\n");
}

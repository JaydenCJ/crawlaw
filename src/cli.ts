#!/usr/bin/env node
/**
 * crawlaw CLI.
 *
 * Subcommands:
 *   check  <robots.txt> --agent <bot> <path>...   may this bot fetch these paths?
 *   audit  <robots.txt> [--path <p>]...           run the embedded AI-bot registry
 *   diff   <old> <new>                            what decisions changed?
 *   agents [--category <c>]                       print the embedded registry
 *
 * Exit codes: 0 = allowed / clean / no changes; 1 = blocked / gate failed /
 * changes found; 2 = usage or input error. The split lets CI tell a policy
 * outcome from a broken invocation.
 */

import { readFileSync } from "node:fs";
import { parseArgs, parseFormat, UsageError, type FlagSpec } from "./cliargs.js";
import { auditRobots, gateViolations } from "./audit.js";
import { diffRobots } from "./diff.js";
import { evaluateAll } from "./evaluate.js";
import { parseRobots } from "./parse.js";
import { botsInCategory, isCategory, REGISTRY } from "./registry.js";
import {
  auditToJson,
  decisionToJson,
  diffToJson,
  registryToJson,
  renderAudit,
  renderDecisions,
  renderDiff,
  renderRegistry,
  renderWarnings,
} from "./report.js";
import type { BotCategory, RobotsFile } from "./types.js";
import { VERSION } from "./version.js";

const HELP = `crawlaw ${VERSION} — spec-exact robots.txt evaluation, AI-crawler audit, policy diffs

Usage:
  crawlaw check <robots.txt> --agent <bot> <path>... [options]
  crawlaw audit <robots.txt> [--path <p>]... [--category <c>]... [--require-blocked <c>] [options]
  crawlaw diff  <old.txt> <new.txt> [--agent <bot>]... [--path <p>]... [options]
  crawlaw agents [--category <c>]... [options]

Commands:
  check   Evaluate one bot against one or more paths (RFC 9309 semantics)
          and print the matched group, winning rule and line numbers.
  audit   Evaluate every bot in the embedded AI-crawler registry and
          summarize who may fetch what, category by category.
  diff    Compare two robots.txt files semantically: report every
          agent/path decision that flipped, plus structural changes.
  agents  Print the embedded registry (token, operator, category,
          documented robots.txt compliance).

Options:
  --agent <bot>          Bot to evaluate (check: required; diff: repeatable filter)
  --path <p>             Extra path to probe (audit, diff; repeatable)
  --category <c>         Registry category filter (audit, agents; repeatable):
                         ai-training | ai-search | ai-assistant | search | archive
  --require-blocked <c>  audit: exit 1 unless every bot in category <c> is blocked
  --format text|json     Output format (default text)
  -q, --quiet            Suppress parser warnings on stderr
  --version              Print the version
  -h, --help             Print this help

Exit codes: 0 allowed/clean/no changes; 1 blocked/gate failed/changes; 2 usage error.
robots.txt arguments accept "-" to read from stdin.`;

/** Flags every subcommand accepts. */
const GLOBAL_FLAGS: FlagSpec[] = [
  { names: ["--format"] },
  { names: ["--quiet", "-q"], boolean: true },
  { names: ["--help", "-h"], boolean: true },
  { names: ["--version"], boolean: true },
];

// Per-command flag sets, so a flag a subcommand would silently ignore is
// rejected as a usage error instead (e.g. `check --require-blocked`).
const CHECK_FLAGS: FlagSpec[] = [{ names: ["--agent"], repeatable: true }, ...GLOBAL_FLAGS];
const AUDIT_FLAGS: FlagSpec[] = [
  { names: ["--path"], repeatable: true },
  { names: ["--category"], repeatable: true },
  { names: ["--require-blocked"] },
  ...GLOBAL_FLAGS,
];
const DIFF_FLAGS: FlagSpec[] = [
  { names: ["--agent"], repeatable: true },
  { names: ["--path"], repeatable: true },
  ...GLOBAL_FLAGS,
];
const AGENTS_FLAGS: FlagSpec[] = [{ names: ["--category"], repeatable: true }, ...GLOBAL_FLAGS];

interface Io {
  out(text: string): void;
  err(text: string): void;
}

function readSource(path: string): { name: string; text: string } {
  const name = path === "-" ? "<stdin>" : path;
  let text: string;
  try {
    text = path === "-" ? readFileSync(0, "utf8") : readFileSync(path, "utf8");
  } catch {
    throw new UsageError(`cannot read "${name}"`);
  }
  return { name, text };
}

function loadRobots(path: string, quiet: boolean, io: Io): { name: string; robots: RobotsFile } {
  const { name, text } = readSource(path);
  const robots = parseRobots(text);
  if (!quiet && robots.warnings.length > 0) {
    io.err(renderWarnings(robots.warnings, name) + "\n");
  }
  return { name, robots };
}

function parseCategories(values: readonly string[]): BotCategory[] {
  return values.map((v) => {
    const c = v.toLowerCase();
    if (!isCategory(c)) {
      throw new UsageError(
        `unknown category "${v}" (expected ai-training, ai-search, ai-assistant, search or archive)`
      );
    }
    return c;
  });
}

// ---- subcommands -------------------------------------------------------

function cmdCheck(argv: readonly string[], io: Io): number {
  const args = parseArgs(argv, CHECK_FLAGS);
  const [file, ...paths] = args.positionals;
  if (file === undefined) throw new UsageError("check needs a robots.txt path (or -)");
  const agents = args.lists.get("--agent") ?? [];
  if (agents.length !== 1) throw new UsageError("check needs exactly one --agent");
  if (paths.length === 0) throw new UsageError("check needs at least one path to evaluate");
  const format = parseFormat(args.values.get("--format"));
  const { robots } = loadRobots(file, args.flags.has("--quiet"), io);

  const decisions = evaluateAll(robots, agents[0] as string, paths);
  if (format === "json") {
    io.out(JSON.stringify(decisions.map(decisionToJson), null, 2) + "\n");
  } else {
    io.out(renderDecisions(decisions) + "\n");
  }
  return decisions.every((d) => d.allowed) ? 0 : 1;
}

function cmdAudit(argv: readonly string[], io: Io): number {
  const args = parseArgs(argv, AUDIT_FLAGS);
  const [file, ...extra] = args.positionals;
  if (file === undefined) throw new UsageError("audit needs a robots.txt path (or -)");
  if (extra.length > 0) throw new UsageError(`unexpected argument "${extra[0]}" (paths go via --path)`);
  const format = parseFormat(args.values.get("--format"));
  const categories = parseCategories(args.lists.get("--category") ?? []);
  const gateRaw = args.values.get("--require-blocked");
  const { name, robots } = loadRobots(file, args.flags.has("--quiet"), io);

  const result = auditRobots(robots, { paths: args.lists.get("--path") ?? [], categories });
  if (format === "json") {
    io.out(JSON.stringify(auditToJson(result, name), null, 2) + "\n");
  } else {
    io.out(renderAudit(result, name) + "\n");
  }

  if (gateRaw !== undefined) {
    const gate = parseCategories([gateRaw])[0] as BotCategory;
    if (botsInCategory(gate).length === 0) throw new UsageError(`empty gate category "${gate}"`);
    const violations = gateViolations(result, gate);
    if (violations.length > 0) {
      io.err(
        `crawlaw: gate failed — ${violations.length} ${gate} bot${violations.length === 1 ? "" : "s"} not fully blocked: ` +
          violations.map((v) => v.bot.token).join(", ") +
          "\n"
      );
      return 1;
    }
    io.err(`crawlaw: gate ok — every ${gate} bot is blocked\n`);
  }
  return 0;
}

function cmdDiff(argv: readonly string[], io: Io): number {
  const args = parseArgs(argv, DIFF_FLAGS);
  const [beforePath, afterPath, ...extra] = args.positionals;
  if (beforePath === undefined || afterPath === undefined) {
    throw new UsageError("diff needs two robots.txt paths: <old> <new>");
  }
  if (extra.length > 0) throw new UsageError(`unexpected argument "${extra[0]}"`);
  if (beforePath === "-" && afterPath === "-") {
    throw new UsageError('only one side of a diff can be "-"');
  }
  const format = parseFormat(args.values.get("--format"));
  const quiet = args.flags.has("--quiet");
  const before = loadRobots(beforePath, quiet, io);
  const after = loadRobots(afterPath, quiet, io);

  const result = diffRobots(before.robots, after.robots, {
    agents: args.lists.get("--agent") ?? [],
    paths: args.lists.get("--path") ?? [],
  });
  if (format === "json") {
    io.out(JSON.stringify(diffToJson(result, before.name, after.name), null, 2) + "\n");
  } else {
    io.out(renderDiff(result, before.name, after.name) + "\n");
  }
  return result.identical ? 0 : 1;
}

function cmdAgents(argv: readonly string[], io: Io): number {
  const args = parseArgs(argv, AGENTS_FLAGS);
  if (args.positionals.length > 0) {
    throw new UsageError(`unexpected argument "${args.positionals[0]}"`);
  }
  const format = parseFormat(args.values.get("--format"));
  const categories = parseCategories(args.lists.get("--category") ?? []);
  const bots =
    categories.length === 0 ? [...REGISTRY] : REGISTRY.filter((b) => categories.includes(b.category));
  if (format === "json") {
    io.out(JSON.stringify(registryToJson(bots), null, 2) + "\n");
  } else {
    io.out(renderRegistry(bots) + "\n");
  }
  return 0;
}

// ---- entry -------------------------------------------------------------

export function main(argv: readonly string[], io: Io): number {
  try {
    if (argv.length === 0) {
      io.err(HELP + "\n");
      return 2;
    }
    if (argv.includes("--help") || argv.includes("-h")) {
      io.out(HELP + "\n");
      return 0;
    }
    if (argv.includes("--version")) {
      io.out(VERSION + "\n");
      return 0;
    }
    const [command, ...rest] = argv;
    switch (command) {
      case "check":
        return cmdCheck(rest, io);
      case "audit":
        return cmdAudit(rest, io);
      case "diff":
        return cmdDiff(rest, io);
      case "agents":
        return cmdAgents(rest, io);
      default:
        throw new UsageError(`unknown command "${command}" (try --help)`);
    }
  } catch (error) {
    if (error instanceof UsageError) {
      io.err(`crawlaw: ${error.message}\n`);
      return 2;
    }
    throw error;
  }
}

const code = main(process.argv.slice(2), {
  out: (t) => void process.stdout.write(t),
  err: (t) => void process.stderr.write(t),
});
process.exitCode = code;

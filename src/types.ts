/**
 * Shared types for the crawlaw engine.
 *
 * The whole pipeline is pure values: `parse.ts` turns text into a
 * `RobotsFile`, `evaluate.ts` turns a `RobotsFile` + agent + path into a
 * `Decision`, and everything downstream (audit, diff, report) consumes
 * those values. Only the CLI touches the filesystem.
 */

/** The two rule kinds RFC 9309 defines inside a group. */
export type RuleKind = "allow" | "disallow";

/** One `Allow:` / `Disallow:` line, with its provenance. */
export interface Rule {
  kind: RuleKind;
  /** Normalized pattern (leading `/` guaranteed, percent-encoding canonicalized). */
  pattern: string;
  /** Pattern exactly as written in the file. */
  raw: string;
  /** 1-based line number in the source file. */
  line: number;
}

/** One `User-agent:` line heading a group. */
export interface AgentLine {
  /** Lowercased product token, or `"*"`. */
  token: string;
  /** Token exactly as written. */
  raw: string;
  line: number;
}

/** A rule group: one or more user-agent lines followed by rules. */
export interface Group {
  agents: AgentLine[];
  rules: Rule[];
  /** Non-standard but widely used; recorded, never enforced. */
  crawlDelay?: { seconds: number; line: number };
  /** Line of the first user-agent line in the group. */
  line: number;
}

/** A parser diagnostic. Parsing never throws; it warns and keeps going. */
export interface ParseWarning {
  line: number;
  message: string;
}

/** The parsed robots.txt. */
export interface RobotsFile {
  groups: Group[];
  sitemaps: { url: string; line: number }[];
  warnings: ParseWarning[];
}

/** Why a decision came out the way it did. */
export type DecisionBasis =
  | "rule" //         a specific allow/disallow rule won
  | "no-rule" //      a group matched but no rule covered the path
  | "no-group"; //    no group matched the agent at all

/** The result of evaluating one agent against one path. */
export interface Decision {
  allowed: boolean;
  /** The agent string as given by the caller. */
  agent: string;
  /** Product token extracted from `agent` and used for matching. */
  agentToken: string;
  /** Normalized path that was evaluated. */
  path: string;
  /**
   * The group token that matched (`"gptbot"`, `"*"`, …) or `null` when no
   * group matched and the default-allow of RFC 9309 applied.
   */
  matchedAgent: string | null;
  /** Lines of the user-agent lines of every group that was combined. */
  groupLines: number[];
  /** The winning rule, or `null` for default-allow. */
  rule: Rule | null;
  basis: DecisionBasis;
  /** One human sentence: what matched, at which line, and why it won. */
  reason: string;
}

/** How reliably a bot honors robots.txt, per public reporting. */
export type Compliance = "yes" | "partial" | "no";

/** Registry categories, ordered from most to least contested. */
export type BotCategory =
  | "ai-training" //   fetches pages to train foundation models
  | "ai-search" //     builds an index that powers AI answers
  | "ai-assistant" //  fetches a page live because a user asked
  | "search" //        classic search engine indexing (baseline)
  | "archive"; //      web preservation

/** One entry in the embedded AI-crawler registry. */
export interface BotInfo {
  /** Product token to match in robots.txt (canonical capitalization). */
  token: string;
  operator: string;
  category: BotCategory;
  /**
   * `crawler` fetches pages itself; `control-token` is only a robots.txt
   * switch read by another crawler (Google-Extended, Applebot-Extended).
   */
  kind: "crawler" | "control-token";
  respectsRobots: Compliance;
  /** One line: what the bot is for, and any compliance caveat. */
  note: string;
}

/** Verdict for one bot across all audited paths. */
export type AuditVerdict = "blocked" | "allowed" | "partial";

/** One row of an audit: a bot, its verdict, and the proof. */
export interface AuditRow {
  bot: BotInfo;
  verdict: AuditVerdict;
  /** One decision per audited path, in input order. */
  decisions: Decision[];
  /**
   * Where the verdict comes from: `"explicit"` (a group names this bot),
   * `"wildcard"` (only the `*` group applied) or `"default"` (no group).
   */
  via: "explicit" | "wildcard" | "default";
}

/** The full audit result. */
export interface AuditResult {
  paths: string[];
  rows: AuditRow[];
  /** Per category: how many bots are fully blocked out of the total. */
  summary: { category: BotCategory; blocked: number; total: number }[];
}

/** One behavioral change found by the differ. */
export interface DecisionChange {
  /** Group-token label; `"*"` means "any bot not named explicitly". */
  agent: string;
  path: string;
  before: boolean; // allowed?
  after: boolean;
  /** Reasons on both sides, for the report. */
  beforeReason: string;
  afterReason: string;
}

/** The full semantic diff between two robots.txt files. */
export interface DiffResult {
  changes: DecisionChange[];
  /** Agent tokens that gained / lost an explicit group. */
  agentsAdded: string[];
  agentsRemoved: string[];
  sitemapsAdded: string[];
  sitemapsRemoved: string[];
  /** Probe paths that were evaluated (for transparency in reports). */
  probes: string[];
  /** True when nothing observable changed. */
  identical: boolean;
}

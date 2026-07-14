/**
 * crawlaw — public programmatic API.
 *
 * ```js
 * import { parseRobots, evaluate } from "crawlaw";
 * const robots = parseRobots("User-agent: GPTBot\nDisallow: /");
 * evaluate(robots, "GPTBot", "/post/1").allowed; // → false
 * ```
 */

export { parseRobots } from "./parse.js";
export {
  canonicalizeEncoding,
  decide,
  matchesPattern,
  normalizePath,
  normalizePattern,
  specificity,
} from "./match.js";
export { groupsWithValue, namedAgents, productToken, selectGroups } from "./agents.js";
export { decideForGroups, evaluate, evaluateAll } from "./evaluate.js";
export {
  CATEGORIES,
  CATEGORY_LABELS,
  REGISTRY,
  botsInCategory,
  findBot,
  isCategory,
} from "./registry.js";
export { auditRobots, gateViolations } from "./audit.js";
export { diffRobots, probesForFile, probesForPattern } from "./diff.js";
export {
  auditToJson,
  decisionToJson,
  diffToJson,
  registryToJson,
  renderAudit,
  renderDecision,
  renderDecisions,
  renderDiff,
  renderRegistry,
  renderWarnings,
} from "./report.js";
export { VERSION } from "./version.js";
export type {
  AgentLine,
  AuditResult,
  AuditRow,
  AuditVerdict,
  BotCategory,
  BotInfo,
  Compliance,
  Decision,
  DecisionBasis,
  DecisionChange,
  DiffResult,
  Group,
  ParseWarning,
  RobotsFile,
  Rule,
  RuleKind,
} from "./types.js";

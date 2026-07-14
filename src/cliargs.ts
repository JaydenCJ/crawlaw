/**
 * Tiny declarative argv parser for the CLI. No dependencies; supports
 * `--flag value`, `--flag=value`, repeatable value flags, boolean flags
 * and positionals. Throws `UsageError` (→ exit 2) on anything malformed
 * so a broken invocation is never confused with a lint finding.
 */

export class UsageError extends Error {}

export interface FlagSpec {
  /** e.g. "--agent"; aliases like "-a" list every accepted spelling. */
  names: string[];
  /** Boolean flags take no value. */
  boolean?: boolean;
  /** Value flags may repeat; each occurrence is collected. */
  repeatable?: boolean;
}

export interface ParsedArgs {
  positionals: string[];
  /** First value per flag (canonical name = first spelling in `names`). */
  values: Map<string, string>;
  /** All values per repeatable flag. */
  lists: Map<string, string[]>;
  flags: Set<string>;
}

export function parseArgs(argv: readonly string[], specs: readonly FlagSpec[]): ParsedArgs {
  const byName = new Map<string, FlagSpec>();
  for (const spec of specs) {
    for (const name of spec.names) byName.set(name, spec);
  }
  const out: ParsedArgs = {
    positionals: [],
    values: new Map(),
    lists: new Map(),
    flags: new Set(),
  };
  let positionalOnly = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (positionalOnly || !arg.startsWith("-") || arg === "-") {
      out.positionals.push(arg);
      continue;
    }
    if (arg === "--") {
      positionalOnly = true;
      continue;
    }
    let name = arg;
    let inline: string | null = null;
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      name = arg.slice(0, eq);
      inline = arg.slice(eq + 1);
    }
    const spec = byName.get(name);
    if (spec === undefined) {
      throw new UsageError(`unknown option "${name}" for this command (see --help)`);
    }
    const canonical = spec.names[0] as string;
    if (spec.boolean === true) {
      if (inline !== null) throw new UsageError(`option "${name}" takes no value`);
      out.flags.add(canonical);
      continue;
    }
    let value = inline;
    if (value === null) {
      const next = argv[i + 1];
      if (next === undefined) throw new UsageError(`option "${name}" needs a value`);
      value = next;
      i++;
    }
    if (spec.repeatable === true) {
      const list = out.lists.get(canonical) ?? [];
      list.push(value);
      out.lists.set(canonical, list);
    } else if (out.values.has(canonical)) {
      throw new UsageError(`option "${name}" given twice`);
    }
    if (!out.values.has(canonical)) out.values.set(canonical, value);
    continue;
  }
  return out;
}

/** Validate a `--format` value; only `text` and `json` exist. */
export function parseFormat(value: string | undefined): "text" | "json" {
  if (value === undefined || value === "text") return "text";
  if (value === "json") return "json";
  throw new UsageError(`--format must be "text" or "json", not "${value}"`);
}

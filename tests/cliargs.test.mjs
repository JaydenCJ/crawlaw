// The argv parser: flags with values, =-form, repeatables, booleans,
// positionals, `--` and the UsageError contract (→ exit 2 in the CLI).
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseArgs, parseFormat, UsageError } from "../dist/cliargs.js";

const SPECS = [
  { names: ["--agent"], repeatable: true },
  { names: ["--format"] },
  { names: ["--quiet", "-q"], boolean: true },
];

test("positionals and value flags mix in any order", () => {
  const args = parseArgs(["robots.txt", "--agent", "GPTBot", "/a", "/b"], SPECS);
  assert.deepEqual(args.positionals, ["robots.txt", "/a", "/b"]);
  assert.deepEqual(args.lists.get("--agent"), ["GPTBot"]);
});

test("--flag=value form works, including values containing =", () => {
  const args = parseArgs(["--format=json", "--agent=a=b"], SPECS);
  assert.equal(args.values.get("--format"), "json");
  assert.deepEqual(args.lists.get("--agent"), ["a=b"]);
});

test("repeatable flags collect every occurrence in order", () => {
  const args = parseArgs(["--agent", "A", "--agent", "B", "--agent", "C"], SPECS);
  assert.deepEqual(args.lists.get("--agent"), ["A", "B", "C"]);
});

test("boolean flags accept aliases and reject inline values", () => {
  const args = parseArgs(["-q"], SPECS);
  assert.ok(args.flags.has("--quiet"));
  assert.throws(() => parseArgs(["--quiet=yes"], SPECS), UsageError);
});

test("a lone dash is a positional (stdin); `--` ends option parsing", () => {
  const args = parseArgs(["-", "--agent", "X"], SPECS);
  assert.deepEqual(args.positionals, ["-"]);
  const rest = parseArgs(["--", "--agent"], SPECS);
  assert.deepEqual(rest.positionals, ["--agent"]);
});

test("unknown options, missing values and duplicate single flags throw UsageError", () => {
  assert.throws(() => parseArgs(["--bogus"], SPECS), UsageError);
  assert.throws(() => parseArgs(["--format"], SPECS), UsageError);
  assert.throws(() => parseArgs(["--format", "a", "--format", "b"], SPECS), UsageError);
});

test("parseFormat accepts only text and json, defaulting to text", () => {
  assert.equal(parseFormat(undefined), "text");
  assert.equal(parseFormat("text"), "text");
  assert.equal(parseFormat("json"), "json");
  assert.throws(() => parseFormat("yaml"), UsageError);
});

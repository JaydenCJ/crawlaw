#!/usr/bin/env bash
# Smoke test for crawlaw: exercises the real CLI end to end against the
# bundled example policies and freshly written temp files. No network,
# idempotent, runs from a clean checkout (after `npm install`).
# Prints "SMOKE OK" on success.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT="$(pwd)"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

fail() {
  echo "SMOKE FAIL: $1" >&2
  exit 1
}

# 1. Build (idempotent).
npm run build >/dev/null 2>&1 || fail "npm run build failed"
CLI="node $ROOT/dist/cli.js"
echo "[smoke] build ok"

# 2. --version matches package.json; --help documents the surface.
PKG_VERSION="$(node -p "require('$ROOT/package.json').version")"
CLI_VERSION="$($CLI --version)"
[ "$CLI_VERSION" = "$PKG_VERSION" ] || fail "--version mismatch: $CLI_VERSION != $PKG_VERSION"
HELP="$($CLI --help)"
for word in check audit diff agents --require-blocked --format "Exit codes"; do
  echo "$HELP" | grep -q -- "$word" || fail "--help missing $word"
done
echo "[smoke] --help/--version ok ($CLI_VERSION)"

# 3. Usage errors exit 2 (distinct from policy outcomes' 1).
set +e
$CLI frobnicate >/dev/null 2>&1; [ $? -eq 2 ] || { set -e; fail "unknown command should exit 2"; }
$CLI check "$WORKDIR/nope.txt" --agent GPTBot / >/dev/null 2>&1; [ $? -eq 2 ] || { set -e; fail "missing file should exit 2"; }
$CLI audit examples/publisher.txt --category bogus >/dev/null 2>&1; [ $? -eq 2 ] || { set -e; fail "bad category should exit 2"; }
set -e
echo "[smoke] error handling ok (exit 2)"

# 4. check: a named AI bot is blocked with line-number proof; exit 1.
set +e
CHECK_OUT="$($CLI check examples/publisher.txt --agent GPTBot /articles/2026/scoop)"; CHECK_CODE=$?
set -e
[ "$CHECK_CODE" -eq 1 ] || fail "blocked check should exit 1, got $CHECK_CODE"
echo "$CHECK_OUT" | grep -q 'BLOCKED  GPTBot  /articles/2026/scoop' || fail "check verdict line wrong"
echo "$CHECK_OUT" | grep -q 'group "gptbot" (line 4), rule "disallow: /" (line 11)' || fail "check proof wrong"
$CLI check examples/publisher.txt --agent Googlebot /articles/2026/scoop >/dev/null \
  || fail "Googlebot should be allowed (exit 0)"
echo "[smoke] check ok (blocked=1, allowed=0)"

# 5. The longest-match subtleties hold end to end.
printf 'User-agent: *\nDisallow: /\nAllow: /$\n' > "$WORKDIR/homepage-only.txt"
$CLI check "$WORKDIR/homepage-only.txt" --agent AnyBot / >/dev/null || fail "/$ should keep the homepage open"
set +e
$CLI check "$WORKDIR/homepage-only.txt" --agent AnyBot /anything >/dev/null; [ $? -eq 1 ] || { set -e; fail "/anything should be blocked"; }
set -e
echo "[smoke] longest-match / anchor semantics ok"

# 6. audit: the publisher example yields the seeded verdicts.
AUDIT_OUT="$($CLI audit examples/publisher.txt)"
echo "$AUDIT_OUT" | grep -q 'AI training — 7 of 15 blocked' || fail "audit training summary wrong"
echo "$AUDIT_OUT" | grep -q 'AI on-demand fetchers — 0 of 5 blocked' || fail "audit fetcher summary wrong"
echo "$AUDIT_OUT" | grep -q 'explicit "gptbot" group (line 4)' || fail "audit provenance missing"
echo "$AUDIT_OUT" | grep -q 'a robots.txt rule is a request, not a lock' || fail "audit compliance note missing"
echo "[smoke] audit ok (7 of 15 AI-training bots blocked)"

# 7. audit gate: --require-blocked fails leaky files, passes lockdowns.
set +e
$CLI audit examples/publisher.txt --require-blocked ai-training >/dev/null 2>&1
[ $? -eq 1 ] || { set -e; fail "leaky policy should fail the gate"; }
set -e
printf 'User-agent: *\nDisallow: /\n' > "$WORKDIR/lockdown.txt"
$CLI audit "$WORKDIR/lockdown.txt" --require-blocked ai-training >/dev/null 2>&1 \
  || fail "lockdown should pass the gate"
echo "[smoke] --require-blocked gate ok"

# 8. diff: the bundled regression example is caught; identical files exit 0.
set +e
DIFF_OUT="$($CLI diff examples/before.txt examples/after.txt)"; DIFF_CODE=$?
set -e
[ "$DIFF_CODE" -eq 1 ] || fail "changed policies should exit 1"
echo "$DIFF_OUT" | grep -q '6 decisions changed' || fail "diff change count wrong"
echo "$DIFF_OUT" | grep -Eq '\* \(any other bot\) +/internal/ +blocked → allowed' || fail "diff missed the /internal/ regression"
echo "$DIFF_OUT" | grep -Eq 'gptbot +/ +allowed → blocked' || fail "diff missed the gptbot block"
echo "$DIFF_OUT" | grep -q '+ agent group "gptbot"' || fail "diff structural changes missing"
$CLI diff examples/before.txt examples/before.txt >/dev/null || fail "identical files should exit 0"
echo "[smoke] diff ok (regression caught)"

# 9. agents: registry listing and category filter.
$CLI agents | grep -q 'GPTBot .*OpenAI' || fail "agents listing missing GPTBot"
AGENTS_ASSIST="$($CLI agents --category ai-assistant)"
echo "$AGENTS_ASSIST" | grep -q 'Perplexity-User' || fail "agents filter missing Perplexity-User"
echo "$AGENTS_ASSIST" | grep -q 'GPTBot' && fail "agents filter leaked ai-training bots"
echo "[smoke] agents ok"

# 10. JSON outputs are valid JSON with stable fields.
JSON_OUT="$($CLI audit examples/publisher.txt --format json)"
echo "$JSON_OUT" | grep -q '"verdict": "blocked"' || fail "audit JSON missing verdicts"
echo "$JSON_OUT" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>JSON.parse(s))" \
  || fail "audit --format json is not valid JSON"
set +e
CHECK_JSON="$($CLI check examples/publisher.txt --agent GPTBot / --format json)"
set -e
echo "$CHECK_JSON" | grep -q '"line": 11' || fail "check JSON missing rule line"
echo "[smoke] JSON output ok"

# 11. stdin input via "-".
set +e
printf 'User-agent: GPTBot\nDisallow: /\n' | $CLI check - --agent GPTBot /x >/dev/null; CODE=$?
set -e
[ "$CODE" -eq 1 ] || fail "stdin check should exit 1"
echo "[smoke] stdin ok"

# 12. Determinism: two runs over the same input are byte-identical.
$CLI audit examples/publisher.txt > "$WORKDIR/run1.txt" 2>/dev/null
$CLI audit examples/publisher.txt > "$WORKDIR/run2.txt" 2>/dev/null
cmp -s "$WORKDIR/run1.txt" "$WORKDIR/run2.txt" || fail "repeat runs differ"
echo "[smoke] determinism ok"

echo "SMOKE OK"

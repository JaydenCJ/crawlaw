#!/usr/bin/env bash
# Example CI gate: refuse to ship a robots.txt that still admits
# AI-training crawlers, and show reviewers what changed semantically.
#
# Usage: bash examples/ci-gate.sh <candidate-robots.txt> [deployed-robots.txt]
set -euo pipefail

CANDIDATE="${1:?usage: ci-gate.sh <candidate> [deployed]}"
DEPLOYED="${2:-}"

cd "$(dirname "${BASH_SOURCE[0]}")/.."
CRAWLAW="node dist/cli.js"

# 1. Hard gate: every ai-training bot in the registry must be blocked.
#    Exit 1 from crawlaw fails the build.
$CRAWLAW audit "$CANDIDATE" --require-blocked ai-training --quiet

# 2. Advisory: show the reviewer every decision that would change
#    compared to the currently deployed policy (non-fatal).
if [ -n "$DEPLOYED" ]; then
  $CRAWLAW diff "$DEPLOYED" "$CANDIDATE" || true
fi

echo "ci-gate: robots.txt policy OK"

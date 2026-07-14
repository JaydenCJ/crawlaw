# Contributing to crawlaw

Issues, discussions and pull requests are all welcome — this project aims
to stay small, zero-dependency at runtime, and honest about what a
robots.txt actually permits.

## Getting started

Requirements: Node.js >= 22.13 (for the stable `node:test` runner used by the suite).

```bash
git clone https://github.com/JaydenCJ/crawlaw.git
cd crawlaw
npm install            # installs typescript, the only devDependency
npm run build          # compile TypeScript to dist/
npm test               # build + 90 node:test tests
bash scripts/smoke.sh  # end-to-end CLI check against examples/
```

`scripts/smoke.sh` exercises the real CLI (check, audit, diff, agents,
exit codes, the --require-blocked gate, JSON output, stdin, determinism)
against the bundled example policies and must print `SMOKE OK`.

## Before you open a pull request

1. `npx tsc -p tsconfig.json --noEmit` — the tree must type-check clean (strict mode is enforced).
2. `npm test` — all tests must pass.
3. `bash scripts/smoke.sh` — must print `SMOKE OK`.
4. Add tests for behavior changes; keep logic in pure, unit-testable
   modules (parsing, matching, selection, audit and diff all take
   values, not file handles — only the CLI touches the filesystem).
5. Evaluation-semantics changes need a paragraph in
   `docs/evaluation.md` citing the RFC 9309 section or the documented
   crawler behavior they follow, and at least one test per edge.

## Ground rules

- **No runtime dependencies.** The zero-dependency install is a core
  feature; adding one needs justification in the PR and will usually be
  declined.
- No network calls, ever — the tool reads arguments, files and stdin,
  then prints. That is the whole I/O surface, and it is why audits are
  reproducible.
- Verdicts must track RFC 9309 and documented crawler behavior, not
  intuition: when a file is ambiguous, do what the major crawlers do and
  say so in a warning.
- Registry entries (`src/registry.ts`) need a public, citable basis —
  the operator's own documentation or credible independent reporting.
  Speculation is not an entry; `respectsRobots: "yes"` is only for
  operators with documented compliance and no credible contrary reports.
- JSON output shapes and exit codes are stable API: fields are only
  added, never renamed; the 0/1/2 exit-code contract never changes.
- Code comments and doc comments are written in English.

## Reporting bugs

Please include: `crawlaw --version` output, the exact command line, the
smallest robots.txt that reproduces the problem, and — if you believe a
verdict is wrong — what a major crawler actually does with that file.
Crawler-observable behavior and RFC 9309 are the tiebreakers.

## Security

Do not open public issues for security problems; use GitHub private
vulnerability reporting on this repository instead.

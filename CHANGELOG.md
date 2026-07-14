# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-07-13

### Added

- RFC 9309-exact robots.txt parser: group building over consecutive
  `User-agent` lines, comments, BOM/CRLF/CR tolerance, the misspellings
  production crawlers accept (`useragent`, `dissallow`, `crawldelay`, …),
  file-wide `Sitemap` collection, per-group `Crawl-delay` recording, and
  a warning stream instead of exceptions for every malformed line.
- Spec-exact evaluation engine: case-insensitive longest-prefix
  user-agent selection with RFC-mandated group combination, `*` and
  `$` pattern matching via linear (regex-free) segment search,
  percent-encoding canonicalization on both sides, longest-match-wins
  precedence in octets with allow-wins-ties, and default-allow.
- `crawlaw check`: evaluate one bot (bare token, `Token/1.2`, or full
  User-Agent header) against paths or full URLs; every decision carries
  the matched group, winning rule, line numbers and a one-sentence
  reason. Exit 0 allowed / 1 blocked / 2 usage error.
- Embedded AI-crawler registry: 30 bots across ai-training, ai-search,
  ai-assistant, search and archive categories, with operator, purpose
  and a conservatively sourced `respectsRobots` compliance field —
  including the control tokens `Google-Extended` / `Applebot-Extended`
  and the documented robots.txt-ignoring on-demand fetchers.
- `crawlaw audit`: run every registry bot through the evaluator, report
  blocked/allowed/partial verdicts with explicit/wildcard/default
  provenance, per-category blocked-of-total summaries, honest
  paper-shield notes for blocked-but-noncompliant bots, and a
  `--require-blocked <category>` CI gate.
- `crawlaw diff`: semantic policy diffing — probe paths derived from
  every rule pattern on either side (wildcard interiors, literal
  prefixes, past-the-end anchors), every governed agent plus the `*`
  baseline evaluated on both sides, each flipped decision reported with
  both reasons, plus structural changes (agent groups, sitemaps).
  Exit 0 identical / 1 changed, like diff(1).
- `crawlaw agents`: print the embedded registry with `--category`
  filtering.
- CI-ready surface: `--format json` with stable shapes for every
  subcommand, stdin via `-`, `--quiet`, deterministic byte-identical
  output, and the 0/1/2 exit-code contract.
- Public programmatic API (`parseRobots`, `evaluate`, `auditRobots`,
  `diffRobots`, `REGISTRY`, matchers and renderers) with type
  declarations.
- Test suite: 90 node:test tests (unit + CLI integration in fresh temp
  dirs) and an end-to-end `scripts/smoke.sh` against the bundled
  publisher / before / after example policies.

[0.1.0]: https://github.com/JaydenCJ/crawlaw/releases/tag/v0.1.0

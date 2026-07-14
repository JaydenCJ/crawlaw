# The embedded AI-crawler registry

`crawlaw audit` evaluates every entry of a registry that ships inside
the package — no network fetch, no registry update step, reproducible
results. This document explains the fields and the inclusion bar.

## Categories

| Category | Meaning | Typical site-owner stance (2026) |
|---|---|---|
| `ai-training` | fetches pages to train foundation models | most contested; often blocked |
| `ai-search` | builds an index that powers AI answers | mixed: traffic vs. reuse |
| `ai-assistant` | fetches a page live because a user asked | often tolerated; some ignore robots.txt |
| `search` | classic search-engine indexing | almost always wanted |
| `archive` | web preservation | usually wanted |

The `search` and `archive` baselines exist so an audit shows what a
policy *keeps*, not only what it blocks — a rule that locks out
Googlebot by accident is the most expensive robots.txt bug there is.

## Fields

- `token` — the product token to match in robots.txt, in the operator's
  documented capitalization. Matching is case-insensitive.
- `kind` — `crawler` fetches pages itself; `control-token` is a
  robots.txt-only switch read by another crawler. `Google-Extended` and
  `Applebot-Extended` are control tokens: blocking them stops training
  use without stopping the underlying fetcher.
- `respectsRobots` — `yes` only when the operator documents compliance
  and no credible contrary reports exist; `partial` when compliance is
  documented but violations have been credibly reported; `no` when the
  operator itself documents that fetches may bypass robots.txt
  (Perplexity-User, Meta-ExternalFetcher).
- `note` — one sentence: purpose plus any compliance caveat. Rendered in
  audit reports for blocked-but-doubtful bots, because a robots.txt rule
  is a request, not a lock.

## Inclusion and correction bar

An entry needs a public, citable basis: the operator's own crawler
documentation, or reporting from at least one credible independent
source. Speculation is not an entry. The registry is data
(`src/registry.ts`), reviewed like code — corrections with citations are
very welcome, including downgrades of `respectsRobots` when new
reporting lands.

The registry describes the world as of early 2026. Operators rename
tokens and change policies; `crawlaw agents` shows exactly what your
installed version knows.

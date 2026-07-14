# How crawlaw evaluates robots.txt

crawlaw implements RFC 9309 (Robots Exclusion Protocol, September 2022),
plus the de-facto refinements the large crawlers agree on. This document
records the exact semantics, so a verdict from `crawlaw check` can be
defended line by line.

## Parsing

- Lines split on `\n`, `\r\n` or lone `\r`; a UTF-8 BOM is stripped.
- Comments run from the first `#` to the end of the line.
- A directive is `name: value`. Names are case-insensitive. The common
  misspellings production crawlers accept are accepted too, with a
  warning: `useragent`, `user agent`, `dissallow`, `disalow`,
  `crawldelay`, `site-map`.
- Unknown directives and lines without `:` are skipped with a warning.
  Parsing never throws — malformed files degrade the way they do in a
  real crawler.
- **Groups** (RFC 9309 §2.2.1): consecutive `User-agent` lines start a
  group and share the rules that follow; a `User-agent` line after rules
  starts a new group; rules before any `User-agent` line belong to no
  group and are ignored (warned).
- `Sitemap` is a file-wide directive, collected outside groups.
- `Crawl-delay` is non-standard: it is recorded per group (first value
  wins, numeric only) and reported, but never influences a verdict.
- Empty `Disallow:` is the historical allow-all idiom: it produces no
  rule and no warning. Empty `Allow:` also produces no rule but warns,
  because it is almost always a mistake.
- A pattern that does not start with `/` or `*` is repaired to
  `/pattern` with a warning.

## Group selection

- The crawler's identity is its **product token** (`GPTBot`), extracted
  from a bare name, a `Token/1.2` pair, or a full User-Agent header
  (where the token inside `(compatible; Token/…)` wins).
- A group's user-agent value matches when it is a **case-insensitive
  prefix of the crawler's token** — this is how `Googlebot-News` obeys a
  `googlebot` group. The reverse is not true: a `GPTBot-Extra` group
  says nothing about `GPTBot`.
- The **most specific (longest) matching value wins**. All groups
  carrying that value are combined into one rule set (RFC 9309: "the
  matching groups' rules MUST be combined").
- The `*` group applies only when no named value matched. With no
  matching group at all, everything is allowed (RFC 9309 §2.2.1).

RFC 9309 itself specifies exact token matching; the prefix refinement is
what Googlebot, Bingbot and the AI crawlers implement, and an auditor
must model what crawlers actually do. The difference only widens what a
group governs, never narrows it.

## Path matching

- Both the rule pattern and the request path are canonicalized first:
  percent-escapes of unreserved characters (`%7E` → `~`) are decoded,
  all other escapes keep their encoding with uppercased hex (`%2f` →
  `%2F`, still distinct from `/`), and invalid escapes stay literal.
- `*` matches any run of characters, including none. `$` at the very end
  of a pattern anchors it to the end of the path; elsewhere it is
  literal.
- Matching is implemented as linear greedy segment search, not a
  compiled regular expression — hostile patterns can neither inject
  metacharacters nor trigger catastrophic backtracking.
- **Precedence** (RFC 9309 §2.2.2): among matching rules, the one with
  the longest pattern (measured in octets) wins. On an exact tie between
  an `allow` and a `disallow`, the `allow` wins.
- No matching rule means allowed. This is why `Disallow: /` followed by
  `Allow: /$` keeps exactly the homepage crawlable.

## What crawlaw does not model

- HTTP-level rules: RFC 9309's "4xx means allow all, 5xx means disallow
  all" applies to fetching robots.txt, which crawlaw — an offline
  evaluator — never does.
- `<meta name="robots">` and `X-Robots-Tag`: indexing controls, not
  crawl controls.
- Non-standard directives beyond `Crawl-delay` (e.g. `Noindex`,
  `Clean-param`) are surfaced as warnings, not evaluated.

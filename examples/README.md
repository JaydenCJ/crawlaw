# crawlaw examples

Three small, self-contained scenarios. Run everything from the repository
root after `npm install && npm run build`.

## `publisher.txt` — a typical 2026 publisher policy

A robots.txt that names seven AI-training crawlers plus PerplexityBot and
blocks them entirely, while the `*` group only protects `/drafts/` and
`/internal/`. Audit it:

```bash
node dist/cli.js audit examples/publisher.txt
```

The report shows the policy is leakier than it looks: 8 of 15 known
AI-training crawlers are still allowed (they are not named, so only the
mild `*` rules apply), and every on-demand AI fetcher may read the whole
site. Ask about one specific bot and URL:

```bash
node dist/cli.js check examples/publisher.txt --agent FacebookBot /articles/2026/scoop
```

## `before.txt` → `after.txt` — a policy edit with a regression

`after.txt` adds a GPTBot/CCBot block, but the `/internal/` disallow was
lost in the edit. A textual diff shows churn; the semantic diff shows the
consequence:

```bash
node dist/cli.js diff examples/before.txt examples/after.txt
```

Exit code 1 flags that behavior changed; the report lists the intended
flips (gptbot/ccbot now blocked everywhere) *and* the accident
(`/internal/` is now open to every other bot).

## `ci-gate.sh` — block-AI-training as a deploy gate

A three-line pipeline gate: fail the build whenever the robots.txt about
to ship still lets any AI-training crawler in, and print the semantic
diff against the currently deployed copy for the reviewer.

```bash
bash examples/ci-gate.sh examples/publisher.txt examples/before.txt
```

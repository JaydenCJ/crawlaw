/**
 * The embedded AI-crawler registry.
 *
 * Every entry is a bot (or robots.txt control token) that site owners
 * commonly need a verdict on, with its operator, why it fetches pages,
 * and how reliably it honors robots.txt per the operator's own
 * documentation and public reporting. The registry ships inside the
 * binary — an audit needs no network and no registry update to run.
 *
 * Compliance notes are deliberately conservative: `respectsRobots` is
 * only "yes" when the operator documents compliance and no credible
 * contrary reports exist. Registry corrections are welcome but need a
 * public, citable source (see CONTRIBUTING.md).
 */

import type { BotCategory, BotInfo } from "./types.js";

export const CATEGORIES: readonly BotCategory[] = [
  "ai-training",
  "ai-search",
  "ai-assistant",
  "search",
  "archive",
];

/** Human labels for categories, used by reports. */
export const CATEGORY_LABELS: Record<BotCategory, string> = {
  "ai-training": "AI training",
  "ai-search": "AI search indexing",
  "ai-assistant": "AI on-demand fetchers",
  search: "Traditional search",
  archive: "Web archiving",
};

export const REGISTRY: readonly BotInfo[] = [
  // ---- AI training crawlers -------------------------------------------
  {
    token: "GPTBot",
    operator: "OpenAI",
    category: "ai-training",
    kind: "crawler",
    respectsRobots: "yes",
    note: "Crawls the web to train OpenAI foundation models.",
  },
  {
    token: "ClaudeBot",
    operator: "Anthropic",
    category: "ai-training",
    kind: "crawler",
    respectsRobots: "yes",
    note: "Crawls the web to improve Anthropic models.",
  },
  {
    token: "CCBot",
    operator: "Common Crawl",
    category: "ai-training",
    kind: "crawler",
    respectsRobots: "yes",
    note: "Builds the Common Crawl corpus, a primary training source for many labs.",
  },
  {
    token: "Google-Extended",
    operator: "Google",
    category: "ai-training",
    kind: "control-token",
    respectsRobots: "yes",
    note: "Not a fetcher: a robots.txt switch controlling Gemini training use of pages Googlebot fetched.",
  },
  {
    token: "Applebot-Extended",
    operator: "Apple",
    category: "ai-training",
    kind: "control-token",
    respectsRobots: "yes",
    note: "Not a fetcher: a robots.txt switch controlling Apple foundation-model training use of Applebot data.",
  },
  {
    token: "Bytespider",
    operator: "ByteDance",
    category: "ai-training",
    kind: "crawler",
    respectsRobots: "partial",
    note: "Feeds ByteDance LLMs; repeatedly reported crawling despite disallow rules.",
  },
  {
    token: "Meta-ExternalAgent",
    operator: "Meta",
    category: "ai-training",
    kind: "crawler",
    respectsRobots: "yes",
    note: "Crawls for Meta AI training and product improvement.",
  },
  {
    token: "FacebookBot",
    operator: "Meta",
    category: "ai-training",
    kind: "crawler",
    respectsRobots: "yes",
    note: "Older Meta crawler; historically fed speech/language model training.",
  },
  {
    token: "Amazonbot",
    operator: "Amazon",
    category: "ai-training",
    kind: "crawler",
    respectsRobots: "yes",
    note: "Crawls for Alexa answers and Amazon AI model improvement.",
  },
  {
    token: "cohere-training-data-crawler",
    operator: "Cohere",
    category: "ai-training",
    kind: "crawler",
    respectsRobots: "yes",
    note: "Collects training data for Cohere enterprise models.",
  },
  {
    token: "AI2Bot",
    operator: "Ai2 (Allen Institute)",
    category: "ai-training",
    kind: "crawler",
    respectsRobots: "yes",
    note: "Crawls for Ai2 open language-model research corpora.",
  },
  {
    token: "Diffbot",
    operator: "Diffbot",
    category: "ai-training",
    kind: "crawler",
    respectsRobots: "partial",
    note: "Structured-extraction crawler whose output is resold, including for model training.",
  },
  {
    token: "omgili",
    operator: "Webz.io",
    category: "ai-training",
    kind: "crawler",
    respectsRobots: "yes",
    note: "Feeds Webz.io datasets marketed for LLM training.",
  },
  {
    token: "PanguBot",
    operator: "Huawei",
    category: "ai-training",
    kind: "crawler",
    respectsRobots: "partial",
    note: "Collects data for Huawei PanGu models; compliance not publicly documented.",
  },
  {
    token: "Timpibot",
    operator: "Timpi",
    category: "ai-training",
    kind: "crawler",
    respectsRobots: "partial",
    note: "Decentralized index crawler; data also marketed for AI training.",
  },
  // ---- AI search indexing ---------------------------------------------
  {
    token: "OAI-SearchBot",
    operator: "OpenAI",
    category: "ai-search",
    kind: "crawler",
    respectsRobots: "yes",
    note: "Indexes pages for ChatGPT search; distinct from GPTBot and not used for training.",
  },
  {
    token: "Claude-SearchBot",
    operator: "Anthropic",
    category: "ai-search",
    kind: "crawler",
    respectsRobots: "yes",
    note: "Indexes pages to improve Claude search results.",
  },
  {
    token: "PerplexityBot",
    operator: "Perplexity",
    category: "ai-search",
    kind: "crawler",
    respectsRobots: "partial",
    note: "Builds the Perplexity answer index; third parties have reported undeclared fetching.",
  },
  {
    token: "DuckAssistBot",
    operator: "DuckDuckGo",
    category: "ai-search",
    kind: "crawler",
    respectsRobots: "yes",
    note: "Fetches sources for DuckAssist generated answers.",
  },
  {
    token: "YouBot",
    operator: "You.com",
    category: "ai-search",
    kind: "crawler",
    respectsRobots: "yes",
    note: "Indexes pages for You.com AI search products.",
  },
  {
    token: "PetalBot",
    operator: "Huawei",
    category: "ai-search",
    kind: "crawler",
    respectsRobots: "yes",
    note: "Petal Search crawler; also feeds Huawei assistant features.",
  },
  {
    token: "GoogleOther",
    operator: "Google",
    category: "ai-search",
    kind: "crawler",
    respectsRobots: "yes",
    note: "Google R&D crawler used by product teams outside core Search.",
  },
  // ---- AI on-demand fetchers ------------------------------------------
  {
    token: "ChatGPT-User",
    operator: "OpenAI",
    category: "ai-assistant",
    kind: "crawler",
    respectsRobots: "yes",
    note: "Fetches a page live when a ChatGPT user asks about it.",
  },
  {
    token: "Claude-User",
    operator: "Anthropic",
    category: "ai-assistant",
    kind: "crawler",
    respectsRobots: "yes",
    note: "Fetches a page live when a Claude user asks about it.",
  },
  {
    token: "Perplexity-User",
    operator: "Perplexity",
    category: "ai-assistant",
    kind: "crawler",
    respectsRobots: "no",
    note: "Perplexity documents that user-triggered fetches generally ignore robots.txt.",
  },
  {
    token: "Meta-ExternalFetcher",
    operator: "Meta",
    category: "ai-assistant",
    kind: "crawler",
    respectsRobots: "no",
    note: "Meta documents that user-initiated fetches may bypass robots.txt rules.",
  },
  {
    token: "MistralAI-User",
    operator: "Mistral AI",
    category: "ai-assistant",
    kind: "crawler",
    respectsRobots: "yes",
    note: "Fetches cited sources for Le Chat user requests.",
  },
  // ---- Baselines: classic search and archiving ------------------------
  {
    token: "Googlebot",
    operator: "Google",
    category: "search",
    kind: "crawler",
    respectsRobots: "yes",
    note: "Core Google Search indexing — the baseline most sites want to keep.",
  },
  {
    token: "Bingbot",
    operator: "Microsoft",
    category: "search",
    kind: "crawler",
    respectsRobots: "yes",
    note: "Bing Search indexing; also feeds Copilot answers via the Bing index.",
  },
  {
    token: "archive.org_bot",
    operator: "Internet Archive",
    category: "archive",
    kind: "crawler",
    respectsRobots: "partial",
    note: "Wayback Machine preservation; the Archive applies robots.txt selectively by policy.",
  },
];

/** Bots in a category, in registry order. */
export function botsInCategory(category: BotCategory): BotInfo[] {
  return REGISTRY.filter((b) => b.category === category);
}

/** Case-insensitive registry lookup by product token. */
export function findBot(token: string): BotInfo | null {
  const t = token.toLowerCase();
  return REGISTRY.find((b) => b.token.toLowerCase() === t) ?? null;
}

/** True when `value` is one of the five registry categories. */
export function isCategory(value: string): value is BotCategory {
  return (CATEGORIES as readonly string[]).includes(value);
}

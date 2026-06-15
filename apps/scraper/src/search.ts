import type { Page } from "playwright";
import { getBrowser, newContext } from "./browser";

export type SearchEngine = "duckduckgo" | "bing";
type AnyEngine = SearchEngine | "brave";

type RawResult = {
  title: string;
  url: string;
  snippet: string;
  thumbnail?: string;
  og_image?: string | null;
};

export type SearchResult = RawResult & { engine: AnyEngine };

export interface SearchOptions {
  query: string;
  engine?: SearchEngine;
  maxResults?: number;
}

const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ── DuckDuckGo ────────────────────────────────────────────────────────────────
// DDG's HTML endpoint detects Playwright's Chromium fingerprint and shows a
// CAPTCHA. Fix: fetch the HTML with a plain HTTP client (no bot detection),
// then load it into a Playwright page via setContent() for DOM querying.

async function searchDuckDuckGo(
  page: Page,
  query: string,
  maxResults: number,
): Promise<RawResult[]> {
  const res = await fetch(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    },
  );

  if (!res.ok) {
    console.warn(`[DDG] Blocked: HTTP ${res.status} for query "${query}"`);
    return [];
  }

  const html = await res.text();

  if (/captcha|unusual traffic|blocked/i.test(html)) {
    console.warn(`[DDG] Bot detection page returned for query "${query}"`);
  }

  // Load the fetched HTML into the page (no outbound network requests needed)
  await page.setContent(html, { waitUntil: "commit" });

  const results = await page.evaluate((max: number) => {
    const items = document.querySelectorAll(".result.results_links_deep");

    return Array.from(items)
      .slice(0, max)
      .map((item) => {
        const anchor = item.querySelector<HTMLAnchorElement>("a.result__a");
        const snippetEl = item.querySelector(".result__snippet");

        // DDG redirects: /l/?uddg=<encoded_url>&...
        const href = anchor?.getAttribute("href") ?? "";
        let url = href;
        try {
          const qs = href.includes("?") ? href.split("?")[1] : "";
          const params = new URLSearchParams(qs ?? "");
          const uddg = params.get("uddg");
          if (uddg) url = decodeURIComponent(uddg);
        } catch {
          // leave url as-is
        }

        const imgEl = item.querySelector<HTMLImageElement>(
          "img.result__image, .result__image img",
        );

        return {
          title: anchor?.textContent?.trim() ?? "",
          url,
          snippet: snippetEl?.textContent?.trim() ?? "",
          og_image: imgEl?.src || imgEl?.getAttribute("data-src") || null,
        };
      })
      .filter((r) => r.title && r.url);
  }, maxResults);

  if (results.length === 0) {
    console.warn(
      `[DDG] Zero results for query "${query}" - possible bot block`,
    );
  }

  return results;
}

// ── Bing ──────────────────────────────────────────────────────────────────────
// Bing wraps result URLs in a click-tracker: /ck/a?...&u=a1<base64_url>&...
// Decode them so callers receive the actual destination URL.

function decodeBingUrl(href: string): string {
  if (!href.includes("/ck/a?")) return href;
  try {
    const qs = href.includes("?") ? href.split("?")[1] : "";
    const u = new URLSearchParams(qs).get("u");
    if (u?.startsWith("a1")) {
      return Buffer.from(u.slice(2), "base64").toString("utf-8");
    }
  } catch {
    // fall through
  }
  return href;
}

async function searchBing(
  page: Page,
  query: string,
  maxResults: number,
): Promise<RawResult[]> {
  await page.goto(
    `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=en&cc=US`,
    { waitUntil: "load", timeout: 25_000 },
  );

  // Detect bot/CAPTCHA pages
  const title = await page.title();
  const hasCaptchaEl =
    (await page.$("#captcha, .captcha_container, #inferui")) !== null;
  if (
    hasCaptchaEl ||
    /access denied|robot check|are you a human|captcha/i.test(title)
  ) {
    console.warn(
      `[Bing] Bot detection triggered for query "${query}" - page title: "${title}"`,
    );
    return [];
  }

  // Dismiss cookie/consent overlay if present (EU regions)
  const consent = await page.$("#bnp_btn_accept");
  if (consent) {
    await consent.click();
    await page.waitForTimeout(500);
  }

  // Wait for actual result items, not just the (initially hidden) container
  try {
    await page.waitForSelector("#b_results li.b_algo", { timeout: 15_000 });
  } catch {
    const currentTitle = await page.title();
    console.warn(
      `[Bing] Results selector timed out for query "${query}" - page title: "${currentTitle}"`,
    );
    return [];
  }

  const raw = await page.evaluate((max: number) => {
    const items = document.querySelectorAll("#b_results li.b_algo");

    return Array.from(items)
      .slice(0, max)
      .map((item) => {
        const anchor = item.querySelector<HTMLAnchorElement>("h2 a");
        const snippetEl =
          item.querySelector(".b_caption p") ??
          item.querySelector(".b_caption .b_algoSlug");

        const thumbEl = item.querySelector<HTMLImageElement>(
          ".b_thumb img, .b_imageCap img",
        );

        const thumbnail =
          thumbEl?.src || thumbEl?.getAttribute("data-src") || undefined;

        return {
          title: anchor?.textContent?.trim() ?? "",
          url: anchor?.getAttribute("href") ?? "",
          snippet: snippetEl?.textContent?.trim() ?? "",
          thumbnail,
          og_image: thumbnail ?? null,
        };
      })
      .filter((r) => r.title && r.url);
  }, maxResults);

  if (raw.length === 0) {
    console.warn(
      `[Bing] Zero results for query "${query}" - possible bot block`,
    );
  }

  return raw.map((r) => ({ ...r, url: decodeBingUrl(r.url) }));
}

// ── Brave Search API ──────────────────────────────────────────────────────────

interface BraveWebResult {
  title: string;
  url: string;
  description?: string;
  thumbnail?: { src?: string };
}

interface BraveApiResponse {
  web?: { results?: BraveWebResult[] };
}

async function searchBrave(
  query: string,
  maxResults: number,
): Promise<RawResult[]> {
  const apiKey = process.env["BRAVE_API_KEY"] ?? "";
  if (!apiKey) {
    console.warn("[Brave] BRAVE_API_KEY is not set - skipping");
    return [];
  }

  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`,
    {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
    },
  );

  if (!res.ok) {
    console.warn(`[Brave] HTTP ${res.status} for query "${query}"`);
    return [];
  }

  const data = (await res.json()) as BraveApiResponse;
  const items = data?.web?.results ?? [];

  const results = items
    .slice(0, maxResults)
    .map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      snippet: r.description ?? "",
      og_image: r.thumbnail?.src ?? null,
    }))
    .filter((r) => r.title && r.url);

  if (results.length === 0) {
    console.warn(`[Brave] Zero results for query "${query}"`);
  }

  return results;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function runEngine(
  engine: AnyEngine,
  query: string,
  maxResults: number,
): Promise<RawResult[]> {
  if (engine === "duckduckgo") {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
      return await searchDuckDuckGo(page, query, maxResults);
    } finally {
      await page.close();
    }
  }

  if (engine === "bing") {
    const context = await newContext();
    const page = await context.newPage();
    try {
      await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
      return await searchBing(page, query, maxResults);
    } finally {
      await context.close();
    }
  }

  // brave
  return searchBrave(query, maxResults);
}

// ── Public API ─────────────────────────────────────────────────────────────────

const FALLBACK_CHAIN: Record<SearchEngine, AnyEngine[]> = {
  duckduckgo: ["duckduckgo", "bing", "brave"],
  bing: ["bing", "duckduckgo", "brave"],
};

export async function searchWeb(
  options: SearchOptions,
): Promise<SearchResult[]> {
  const { query, engine = "duckduckgo", maxResults = 5 } = options;
  const chain = FALLBACK_CHAIN[engine];
  const tried: AnyEngine[] = [];

  for (const current of chain) {
    let results: RawResult[] = [];

    try {
      results = await runEngine(current, query, maxResults);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[Search] ${current} threw an error: ${reason}`);
      tried.push(current);
      continue;
    }

    if (results.length > 0) {
      if (tried.length > 0) {
        console.info(
          `[Search] Succeeded with "${current}" after: ${tried.join(" → ")} returned no results`,
        );
      }
      return results.map((r) => ({ ...r, engine: current }));
    }

    tried.push(current);
  }

  console.error(`[Search] All engines exhausted for query "${query}"`);
  return [];
}

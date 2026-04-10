import type { Page } from 'playwright';
import { getBrowser } from './browser';

export type SearchEngine = 'duckduckgo' | 'bing';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  thumbnail?: string;
  og_image?: string | null;
}

export interface SearchOptions {
  query: string;
  engine?: SearchEngine;
  maxResults?: number;
}

const BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ── DuckDuckGo ────────────────────────────────────────────────────────────────
// DDG's HTML endpoint detects Playwright's Chromium fingerprint and shows a
// CAPTCHA. Fix: fetch the HTML with a plain HTTP client (no bot detection),
// then load it into a Playwright page via setContent() for DOM querying.

async function searchDuckDuckGo(
  page: Page,
  query: string,
  maxResults: number,
): Promise<SearchResult[]> {
  const res = await fetch(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    },
  );

  if (!res.ok) return [];

  const html = await res.text();

  // Load the fetched HTML into the page (no outbound network requests needed)
  await page.setContent(html, { waitUntil: 'commit' });

  return page.evaluate((max: number) => {
    const items = document.querySelectorAll('.result.results_links_deep');

    return Array.from(items)
      .slice(0, max)
      .map((item) => {
        const anchor = item.querySelector<HTMLAnchorElement>('a.result__a');
        const snippetEl = item.querySelector('.result__snippet');

        // DDG redirects: /l/?uddg=<encoded_url>&...
        const href = anchor?.getAttribute('href') ?? '';
        let url = href;
        try {
          const qs = href.includes('?') ? href.split('?')[1] : '';
          const params = new URLSearchParams(qs ?? '');
          const uddg = params.get('uddg');
          if (uddg) url = decodeURIComponent(uddg);
        } catch {
          // leave url as-is
        }

        const imgEl = item.querySelector<HTMLImageElement>('img.result__image, .result__image img');

        return {
          title: anchor?.textContent?.trim() ?? '',
          url,
          snippet: snippetEl?.textContent?.trim() ?? '',
          og_image: imgEl?.src || imgEl?.getAttribute('data-src') || null,
        };
      })
      .filter((r) => r.title && r.url);
  }, maxResults);
}

// ── Bing ──────────────────────────────────────────────────────────────────────
// Bing wraps result URLs in a click-tracker: /ck/a?...&u=a1<base64_url>&...
// Decode them so callers receive the actual destination URL.

function decodeBingUrl(href: string): string {
  if (!href.includes('/ck/a?')) return href;
  try {
    const qs = href.includes('?') ? href.split('?')[1] : '';
    const u = new URLSearchParams(qs).get('u');
    if (u?.startsWith('a1')) {
      return Buffer.from(u.slice(2), 'base64').toString('utf-8');
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
): Promise<SearchResult[]> {
  await page.goto(
    `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=en&cc=US`,
    { waitUntil: 'load', timeout: 25_000 },
  );

  // Dismiss cookie/consent overlay if present (EU regions)
  const consent = await page.$('#bnp_btn_accept');
  if (consent) {
    await consent.click();
    await page.waitForTimeout(500);
  }

  // Wait for actual result items, not just the (initially hidden) container
  await page.waitForSelector('#b_results li.b_algo', { timeout: 15_000 });

  const raw = await page.evaluate((max: number) => {
    const items = document.querySelectorAll('#b_results li.b_algo');

    return Array.from(items)
      .slice(0, max)
      .map((item) => {
        const anchor = item.querySelector<HTMLAnchorElement>('h2 a');
        const snippetEl =
          item.querySelector('.b_caption p') ??
          item.querySelector('.b_caption .b_algoSlug');

        const thumbEl = item.querySelector<HTMLImageElement>(
          '.b_thumb img, .b_imageCap img',
        );

        const thumbnail = thumbEl?.src || thumbEl?.getAttribute('data-src') || undefined;

        return {
          title: anchor?.textContent?.trim() ?? '',
          url: anchor?.getAttribute('href') ?? '',
          snippet: snippetEl?.textContent?.trim() ?? '',
          thumbnail,
          og_image: thumbnail ?? null,
        };
      })
      .filter((r) => r.title && r.url);
  }, maxResults);

  return raw.map((r) => ({ ...r, url: decodeBingUrl(r.url) }));
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function searchWeb(options: SearchOptions): Promise<SearchResult[]> {
  const { query, engine = 'duckduckgo', maxResults = 5 } = options;

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

    if (engine === 'bing') {
      return await searchBing(page, query, maxResults);
    }
    return await searchDuckDuckGo(page, query, maxResults);
  } finally {
    await page.close();
  }
}

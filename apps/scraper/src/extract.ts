import { newContext } from './browser';

export interface ExtractResult {
  title: string;
  url: string;
  content: string;
  og_image: string | null;
}

const BLOCKED_RESOURCE_TYPES = new Set(['image', 'media', 'font', 'stylesheet']);

const CF_SIGNALS = [
  'ray id',
  'just a moment',
  'checking your browser',
  'enable javascript and cookies',
  'additional verification required',
  'cf-browser-verification',
  'cloudflare to restrict access',
  'please wait while we verify',
];

function isCloudflareBlock(title: string, content: string): boolean {
  const haystack = (title + ' ' + content.slice(0, 2000)).toLowerCase();
  return CF_SIGNALS.some((signal) => haystack.includes(signal));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const BLOCKED_HOSTS = [
  'google-analytics.com',
  'googletagmanager.com',
  'facebook.net',
  'doubleclick.net',
  'hotjar.com',
  'mixpanel.com',
  'segment.io',
  'clarity.ms',
  'analytics.tiktok.com',
];

function buildProxy() {
  const host = process.env['PROXY_HOST'];
  const port = process.env['PROXY_PORT'];
  const username = process.env['PROXY_USER'];
  const password = process.env['PROXY_PASS'];
  if (!host || !port) return undefined;
  return { server: `http://${host}:${port}`, username, password };
}

const PROXY_DOMAINS_DEFAULT = ['indeed.com'];

const PROXY_DOMAINS: string[] = [
  ...PROXY_DOMAINS_DEFAULT,
  ...(process.env['PROXY_DOMAINS'] ?? '')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean),
];

function getProxyForUrl(url: string) {
  const proxy = buildProxy();
  if (!proxy) return undefined;
  try {
    const hostname = new URL(url).hostname;
    if (PROXY_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`))) {
      return proxy;
    }
  } catch {
    // invalid URL — skip proxy
  }
  return undefined;
}

const MAX_ATTEMPTS = 5;

export async function extractUrl(url: string): Promise<ExtractResult> {
  const proxy = getProxyForUrl(url);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const context = await newContext(
      proxy ? { proxy, ignoreHTTPSErrors: true } : undefined,
    );
    const page = await context.newPage();

    try {
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

      await page.route('**/*', (route) => {
        const type = route.request().resourceType();
        const reqUrl = route.request().url();

        if (
          BLOCKED_RESOURCE_TYPES.has(type) ||
          BLOCKED_HOSTS.some((h) => reqUrl.includes(h))
        ) {
          return route.abort();
        }

        return route.continue();
      });

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });

      // On retries give the JS challenge extra time to resolve
      if (attempt > 1) {
        await sleep(2_000);
      }

      const result = await page.evaluate(
        (): { title: string; content: string; og_image: string | null } => {
          const REMOVE_SELECTORS = [
            'script',
            'style',
            'noscript',
            'nav',
            'header',
            'footer',
            'aside',
            '[role="banner"]',
            '[role="navigation"]',
            '[role="complementary"]',
            '[role="contentinfo"]',
            '.cookie-banner',
            '#cookie-banner',
            '.ad',
            '.ads',
            '.advertisement',
            '.sidebar',
          ];

          REMOVE_SELECTORS.forEach((sel) => {
            document.querySelectorAll(sel).forEach((el) => el.remove());
          });

          const content = (document.body?.innerText ?? '')
            .replace(/[ \t]+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

          const og_image =
            (
              document.querySelector(
                'meta[property="og:image"]',
              ) as HTMLMetaElement
            )?.content ||
            (
              document.querySelector(
                'meta[name="twitter:image"]',
              ) as HTMLMetaElement
            )?.content ||
            null;

          return { title: document.title.trim(), content, og_image };
        },
      );

      if (isCloudflareBlock(result.title, result.content)) {
        if (attempt < MAX_ATTEMPTS) {
          await sleep(attempt * 1_500);
          continue;
        }
        throw new Error('Blocked by Cloudflare after multiple attempts');
      }

      return {
        title: result.title,
        url,
        content: result.content,
        og_image: result.og_image,
      };
    } finally {
      await context.close();
    }
  }

  throw new Error('extractUrl: exhausted all retries');
}

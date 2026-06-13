import { newContext } from './browser';

export interface ExtractResult {
  title: string;
  url: string;
  content: string;
  og_image: string | null;
}

const BLOCKED_RESOURCE_TYPES = new Set(['image', 'media', 'font', 'stylesheet']);

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

export async function extractUrl(url: string): Promise<ExtractResult> {
  const proxy = buildProxy();
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
      timeout: 30_000,
    });

    const result = await page.evaluate(
      (): { title: string; content: string; og_image: string | null } => {
        // Remove elements that are unlikely to contain article content
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
          .replace(/[ \t]+/g, ' ') // collapse horizontal whitespace
          .replace(/\n{3,}/g, '\n\n') // collapse excess blank lines
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

import { getBrowser } from './browser';

export interface ExtractResult {
  title: string;
  url: string;
  content: string;
  og_image: string | null;
}

/**
 * Navigates to `url` in a headless browser, strips boilerplate elements
 * (nav, header, footer, sidebars, scripts, styles), and returns the
 * visible text content alongside the page title.
 */
export async function extractUrl(url: string): Promise<ExtractResult> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

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
    await page.close();
  }
}

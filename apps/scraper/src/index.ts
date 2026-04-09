import Fastify from 'fastify';
import { searchWeb, type SearchEngine } from './search';
import { extractUrl } from './extract';
import { closeBrowser } from './browser';

const PORT = parseInt(process.env['PORT'] ?? '4000', 10);
const API_KEY = process.env['SCRAPER_API_KEY'] ?? '';

const app = Fastify({
  logger: {
    level: process.env['LOG_LEVEL'] ?? 'info',
  },
});

// ── Auth ──────────────────────────────────────────────────────────────────────

app.addHook('preHandler', async (request, reply) => {
  if (!API_KEY) return; // no key set → open (dev only)
  if (request.url === '/health') return; // health probe is unauthenticated
  const key = request.headers['x-api-key'];
  if (key !== API_KEY) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
});

// ── POST /search ──────────────────────────────────────────────────────────────
//
// Body: { query: string; engine?: "duckduckgo" | "bing"; maxResults?: number }
// Response: { results: { title, url, snippet }[] }

app.post('/search', async (request, reply) => {
  const body = request.body as {
    query?: string;
    engine?: SearchEngine;
    maxResults?: number;
  };

  const query = body?.query?.trim() ?? '';
  if (!query) {
    return reply.code(400).send({ error: 'query is required.' });
  }

  const engine: SearchEngine =
    body.engine === 'bing' ? 'bing' : 'duckduckgo';
  const maxResults = Math.min(Math.max(Number(body.maxResults ?? 5), 1), 20);

  try {
    const results = await searchWeb({ query, engine, maxResults });
    return { results };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    request.log.error({ err }, 'search failed');
    return reply.code(502).send({ error: message });
  }
});

// ── POST /extract ─────────────────────────────────────────────────────────────
//
// Body: { url: string }
// Response: { title, url, content }

app.post('/extract', async (request, reply) => {
  const body = request.body as { url?: string };

  const url = body?.url?.trim() ?? '';
  if (!url) {
    return reply.code(400).send({ error: 'url is required.' });
  }

  // Basic sanity check — must be http(s)
  if (!/^https?:\/\//i.test(url)) {
    return reply.code(400).send({ error: 'url must start with http:// or https://' });
  }

  try {
    const result = await extractUrl(url);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    request.log.error({ err }, 'extract failed');
    return reply.code(502).send({ error: message });
  }
});

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/health', async () => ({ status: 'ok' }));

// ── Start ─────────────────────────────────────────────────────────────────────

const shutdown = async () => {
  await closeBrowser();
  await app.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});

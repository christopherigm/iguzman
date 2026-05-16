import { NextRequest } from 'next/server';
import logger from '@/lib/logger';

const log = logger.child({ module: 'api/groq/chat' });

export async function POST(req: NextRequest) {
  const clientKey = req.headers.get('x-groq-api-key');
  const apiKey = clientKey ?? process.env.GROQ_API_KEY;
  if (!apiKey) {
    log.error('GROQ_API_KEY is not configured and no client key was provided');
    return new Response(
      JSON.stringify({ error: 'GROQ_API_KEY not configured' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const body = await req.text();

  const upstream = await fetch(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body,
    },
  );

  if (!upstream.ok) {
    const text = await upstream.text();
    log.warn(
      { status: upstream.status, detail: text },
      'Groq upstream returned error',
    );
    return new Response(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  log.info({ status: upstream.status }, 'Groq request proxied successfully');
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type':
        upstream.headers.get('Content-Type') ?? 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}

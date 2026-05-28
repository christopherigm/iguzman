import { NextResponse } from 'next/server';
import {
  fetchSocialMetadata,
  isScrapeCreatorsPlatform,
} from '@/lib/scrapecreators';
import {
  getCreditsKey,
  requireCredits,
  creditsErrorResponse,
} from '@/lib/credits-middleware';
import logger from '@/lib/logger';

const log = logger.child({ module: 'api/social-metadata' });

export async function POST(request: Request) {
  const creditsKey = getCreditsKey(request);
  if (!creditsKey) return creditsErrorResponse('NO_CREDITS_KEY');
  const creditsResult = await requireCredits(creditsKey, 1);
  if (!creditsResult.ok) return creditsErrorResponse(creditsResult.error);

  let body: { url?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { url } = body;
  if (!url) {
    return NextResponse.json(
      { error: 'Missing url parameter' },
      { status: 400 },
    );
  }

  if (!isScrapeCreatorsPlatform(url)) {
    return NextResponse.json(
      { error: 'Platform not supported for metadata enrichment' },
      { status: 400 },
    );
  }

  const keyOverride =
    request.headers.get('x-scrapecreators-key') ?? undefined;

  try {
    const metadata = await fetchSocialMetadata(url, keyOverride);
    log.info({ url }, 'Social metadata fetched');
    return NextResponse.json({
      ...metadata,
      creditsRemaining: creditsResult.remaining,
    });
  } catch (err) {
    log.error({ err, url }, 'Failed to fetch social metadata');
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Failed to fetch metadata',
      },
      { status: 500 },
    );
  }
}

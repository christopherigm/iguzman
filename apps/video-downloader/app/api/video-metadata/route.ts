import { NextResponse } from 'next/server';
import {
  fetchVideoMetadata,
  listSubtitlesViaYtDlp,
} from '@repo/helpers/download-video';

export interface CaptionOption {
  lang: string;
  label: string;
  url: string;
  type: 'auto' | 'manual';
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const exhaustive = searchParams.get('exhaustive') === 'true';

  if (!url) {
    return NextResponse.json(
      { error: 'Missing url parameter' },
      { status: 400 },
    );
  }

  try {
    const meta = await fetchVideoMetadata(url);
    const formats = meta.formats ?? [];

    const heights = [
      ...new Set(
        formats
          .filter(
            (f) =>
              f.vcodec !== 'none' &&
              f.vcodec != null &&
              f.height != null &&
              f.height > 0,
          )
          .map((f) => f.height as number),
      ),
    ].sort((a, b) => b - a);

    /* ── Extract available captions ───────────────────── */
    const captionMap = new Map<string, CaptionOption>();

    const addCaptions = (
      source: Record<string, { ext: string; url: string }[]>,
      type: 'auto' | 'manual',
    ) => {
      for (const [lang, entries] of Object.entries(source)) {
        if (captionMap.has(lang)) continue;
        const srtEntry = entries.find(
          (e) => e.ext === 'srt' || e.ext === 'vtt',
        );
        if (srtEntry?.url) {
          const label = type === 'auto' ? `${lang} (auto)` : lang;
          captionMap.set(lang, { lang, label, url: srtEntry.url, type });
        }
      }
    };

    // Prefer manual subtitles over auto-generated ones
    addCaptions(meta.subtitles ?? {}, 'manual');
    addCaptions(meta.automatic_captions ?? {}, 'auto');

    let captions = [...captionMap.values()];

    if (captions.length === 0 && exhaustive) {
      console.log(
        `No captions found for ${url} via standard metadata, trying yt-dlp fallback...`,
      );
      const fallback = await listSubtitlesViaYtDlp(url);
      console.log(`yt-dlp found ${fallback.length} captions for ${url}`);
      captions = fallback.map((s) => ({
        lang: s.lang,
        label: s.label,
        url: s.url,
        type: s.type,
      }));
    }

    return NextResponse.json({ heights, captions });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Failed to fetch metadata',
      },
      { status: 500 },
    );
  }
}

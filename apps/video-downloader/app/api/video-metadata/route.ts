import { NextResponse } from "next/server";
import {
  fetchVideoMetadata,
  listSubtitlesViaYtDlp,
} from "@repo/helpers/download-video";
import {
  getCreditsKey,
  requireCredits,
  creditsErrorResponse,
} from "@/lib/credits-middleware";
import { getWritableCookiesPath } from "@/lib/writable-cookies";
import logger from "@/lib/logger";

const log = logger.child({ module: "api/video-metadata" });

export interface CaptionOption {
  lang: string;
  label: string;
  url: string;
  type: "auto" | "manual";
}

export async function POST(request: Request) {
  const creditsKey = getCreditsKey(request);
  if (!creditsKey) return creditsErrorResponse("NO_CREDITS_KEY");
  const creditsResult = await requireCredits(creditsKey, 1);
  if (!creditsResult.ok) return creditsErrorResponse(creditsResult.error);

  let body: { url?: string; exhaustive?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { url, exhaustive = false } = body;

  if (!url) {
    log.warn("POST /api/video-metadata - missing url in body");
    return NextResponse.json(
      { error: "Missing url parameter" },
      { status: 400 },
    );
  }

  const remainingCredits = creditsResult.remaining;

  try {
    const cookies = await getWritableCookiesPath();
    const meta = await fetchVideoMetadata(url, { cookies });
    const formats = meta.formats ?? [];

    const videoFormats = formats.filter(
      (f) =>
        f.vcodec !== "none" &&
        f.vcodec != null &&
        f.height != null &&
        f.height > 0,
    );

    const heights = [
      ...new Set(videoFormats.map((f) => f.height as number)),
    ].sort((a, b) => b - a);

    const widthByHeight: Record<number, number> = {};
    for (const f of videoFormats) {
      if (f.height != null && f.width != null && !(f.height in widthByHeight)) {
        widthByHeight[f.height] = f.width;
      }
    }

    /* ── Extract available captions ───────────────────── */
    const captionMap = new Map<string, CaptionOption>();

    const addCaptions = (
      source: Record<string, { ext: string; url: string }[]>,
      type: "auto" | "manual",
    ) => {
      for (const [lang, entries] of Object.entries(source)) {
        if (captionMap.has(lang)) continue;
        const srtEntry = entries.find(
          (e) => e.ext === "srt" || e.ext === "vtt",
        );
        if (srtEntry?.url) {
          const label = type === "auto" ? `${lang} (auto)` : lang;
          captionMap.set(lang, { lang, label, url: srtEntry.url, type });
        }
      }
    };

    addCaptions(meta.subtitles ?? {}, "manual");
    addCaptions(meta.automatic_captions ?? {}, "auto");

    let captions = [...captionMap.values()];

    if (captions.length === 0 && exhaustive) {
      log.info(
        { url },
        "No captions in standard metadata, trying yt-dlp fallback",
      );
      const fallback = await listSubtitlesViaYtDlp(url, { cookies });
      log.info(
        { url, count: fallback.length },
        "yt-dlp caption fallback complete",
      );
      captions = fallback.map((s) => ({
        lang: s.lang,
        label: s.label,
        url: s.url,
        type: s.type,
      }));
    }

    const commentCount =
      (meta as typeof meta & { comment_count?: number }).comment_count ?? null;

    log.info(
      {
        url,
        heightCount: heights.length,
        captionCount: captions.length,
        commentCount,
      },
      "Video metadata fetched",
    );

    return NextResponse.json({
      heights,
      widthByHeight,
      captions,
      commentCount,
      creditsRemaining: remainingCredits,
    });
  } catch (err) {
    log.error({ err, url }, "Failed to fetch video metadata");
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to fetch metadata",
      },
      { status: 500 },
    );
  }
}

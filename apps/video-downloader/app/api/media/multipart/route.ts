import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import logger from "@/lib/logger";
import {
  USE_R2,
  createMultipartUpload,
  uploadMultipartPart,
  completeMultipartUpload,
  abortMultipartUpload,
} from "@/lib/r2";

const log = logger.child({ module: "api/media/multipart" });

/**
 * POST /api/media/multipart?action=initiate&ext=mp4
 *   → { key, uploadId }
 *
 * POST /api/media/multipart?action=part&key=xxx&uploadId=xxx&partNumber=N
 *   body: raw chunk bytes
 *   → { etag }
 *
 * POST /api/media/multipart?action=complete&key=xxx&uploadId=xxx
 *   body: { parts: [{ partNumber, etag }] }
 *   → { file: key }
 *
 * POST /api/media/multipart?action=abort&key=xxx&uploadId=xxx
 *   → { ok: true }
 *
 * Exists so the browser can split large files into ≤90 MB chunks that each
 * pass through Cloudflare's 100 MB upload limit.  All chunk uploads are
 * regular POST requests; R2 assembles them via multipart upload.
 */
export async function POST(request: NextRequest) {
  if (!USE_R2) {
    return NextResponse.json(
      { error: "Multipart upload requires R2" },
      { status: 501 },
    );
  }

  const action = request.nextUrl.searchParams.get("action");

  // ── initiate ──────────────────────────────────────────────────────────────
  if (action === "initiate") {
    const ext = request.nextUrl.searchParams.get("ext") ?? "mp4";
    if (!/^[a-z0-9]{1,10}$/i.test(ext)) {
      return NextResponse.json({ error: "Invalid extension" }, { status: 400 });
    }
    const key = `${randomUUID()}.${ext.toLowerCase()}`;
    try {
      const uploadId = await createMultipartUpload(key);
      log.info({ key }, "POST /api/media/multipart - upload initiated");
      return NextResponse.json({ key, uploadId });
    } catch (err) {
      log.error({ err }, "POST /api/media/multipart - initiate failed");
      return NextResponse.json(
        { error: "Failed to initiate upload" },
        { status: 500 },
      );
    }
  }

  // ── part ──────────────────────────────────────────────────────────────────
  if (action === "part") {
    const key = request.nextUrl.searchParams.get("key");
    const uploadId = request.nextUrl.searchParams.get("uploadId");
    const partNumberStr = request.nextUrl.searchParams.get("partNumber");

    if (!key || !uploadId || !partNumberStr) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }
    const partNumber = parseInt(partNumberStr, 10);
    if (isNaN(partNumber) || partNumber < 1 || partNumber > 10_000) {
      return NextResponse.json(
        { error: "Invalid partNumber" },
        { status: 400 },
      );
    }
    if (!request.body) {
      return NextResponse.json({ error: "Empty body" }, { status: 400 });
    }
    const cl = request.headers.get("content-length");
    if (!cl) {
      return NextResponse.json(
        { error: "Content-Length required" },
        { status: 400 },
      );
    }
    const contentLength = parseInt(cl, 10);

    try {
      const body = Readable.fromWeb(
        request.body as Parameters<typeof Readable.fromWeb>[0],
      );
      const etag = await uploadMultipartPart(
        key,
        uploadId,
        partNumber,
        body,
        contentLength,
      );
      return NextResponse.json({ etag });
    } catch (err) {
      log.error(
        { err, key, partNumber },
        "POST /api/media/multipart - part upload failed",
      );
      return NextResponse.json(
        { error: "Failed to upload part" },
        { status: 500 },
      );
    }
  }

  // ── complete ──────────────────────────────────────────────────────────────
  if (action === "complete") {
    const key = request.nextUrl.searchParams.get("key");
    const uploadId = request.nextUrl.searchParams.get("uploadId");
    if (!key || !uploadId) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }
    try {
      const { parts } = (await request.json()) as {
        parts: { partNumber: number; etag: string }[];
      };
      await completeMultipartUpload(
        key,
        uploadId,
        parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      );
      log.info({ key }, "POST /api/media/multipart - upload completed");
      return NextResponse.json({ file: key });
    } catch (err) {
      log.error({ err, key }, "POST /api/media/multipart - complete failed");
      return NextResponse.json(
        { error: "Failed to complete upload" },
        { status: 500 },
      );
    }
  }

  // ── abort ─────────────────────────────────────────────────────────────────
  if (action === "abort") {
    const key = request.nextUrl.searchParams.get("key");
    const uploadId = request.nextUrl.searchParams.get("uploadId");
    if (!key || !uploadId) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }
    await abortMultipartUpload(key, uploadId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { access, unlink, writeFile } from "node:fs/promises";
import { openAsBlob } from "node:fs";
import {
  getCreditsKey,
  requireCredits,
  refundCredits,
  creditsErrorResponse,
} from "@/lib/credits-middleware";
import { createTask, getTask, updateTask } from "@/lib/video-task-db";
import { USE_R2, downloadToPath, uploadFromPath } from "@/lib/r2";
import { sweepTmpFiles } from "@/lib/tmp-cleanup";
import {
  diarizationToSrt,
  DIARIZE_CREDITS_PER_SECOND,
  type DiarizationSegment,
} from "@/lib/srt-from-diarization";
import logger from "@/lib/logger";

const log = logger.child({ module: "api/diarize" });

const NODE_ENV = process.env.NODE_ENV?.trim() ?? "development";
const IS_PROD = NODE_ENV === "production";
const MEDIA_DIR = IS_PROD ? "/app/media" : "./public/media";
const TEMP_DIR = "/tmp";

const DIARIZATION_URL =
  process.env.DIARIZATION_URL ?? "https://diarization.iguzman.com.mx";
const DIARIZATION_API_KEY = process.env.DIARIZATION_API_KEY ?? "";

const MIME_BY_EXT: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
};

/**
 * Runs the diarization job in the background (independent of the HTTP request)
 * and reports progress/result through the task document, which the client
 * polls via /api/download-video/[id]. This avoids holding a request open for
 * up to ~10 min, which collided with the ingress read timeout.
 */
async function runDiarizeJob(
  taskId: string,
  inputFile: string,
  creditsKey: string,
  cost: number,
  maxWords: number,
): Promise<void> {
  const refundOnFailure = () =>
    refundCredits(creditsKey, cost).catch((err: unknown) =>
      log.error(
        { err, taskId },
        "Failed to refund credits after diarize failure",
      ),
    );

  /* ── Resolve input path (staged in /tmp or download from R2) ─────── */
  let tempInputPath: string | undefined;
  if (USE_R2) {
    tempInputPath = join(TEMP_DIR, inputFile);
    const alreadyStaged = await access(tempInputPath)
      .then(() => true)
      .catch(() => false);
    if (!alreadyStaged) {
      try {
        await downloadToPath(inputFile, tempInputPath);
      } catch (err) {
        log.error(
          { err, taskId, inputFile },
          "Failed to download input from R2",
        );
        await refundOnFailure();
        await updateTask(taskId, {
          status: "error",
          progress: 0,
          error: {
            code: "DOWNLOAD_FAILED",
            message: "Failed to fetch input file",
          },
        }).catch(() => {});
        return;
      }
    }
  }

  const inputPath = tempInputPath ?? join(MEDIA_DIR, inputFile);
  const ext = inputFile.split(".").pop()?.toLowerCase() ?? "mp4";
  const srtFileName = `${randomUUID()}.txt`;
  const srtPath = USE_R2
    ? join(TEMP_DIR, srtFileName)
    : join(MEDIA_DIR, srtFileName);

  try {
    /* ── Upload file to diarization service (streamed from disk) ─────── */
    const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
    const fileBlob = await openAsBlob(inputPath, { type: mime });

    const form = new FormData();
    form.append("file", fileBlob, inputFile);
    form.append("max_words", String(maxWords));

    log.info({ taskId, inputFile, maxWords }, "Sending to diarization service");

    const diarizeRes = await fetch(`${DIARIZATION_URL}/transcribe`, {
      method: "POST",
      headers: DIARIZATION_API_KEY ? { "X-API-Key": DIARIZATION_API_KEY } : {},
      body: form,
    });

    if (!diarizeRes.ok) {
      const errText = await diarizeRes.text().catch(() => "");
      log.error(
        { status: diarizeRes.status, errText },
        "Diarization service error",
      );
      throw new Error(`Diarization service error (${diarizeRes.status})`);
    }

    const { job_id } = (await diarizeRes.json()) as { job_id: string };
    log.info(
      { taskId, inputFile, job_id },
      "Diarization job queued, polling for result",
    );

    const POLL_MS = 3000;
    const MAX_POLLS = 200; // ~10 min ceiling
    let pollResult: { segments: DiarizationSegment[] } | null = null;

    for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
      await new Promise<void>((resolve) => setTimeout(resolve, POLL_MS));

      const pollRes = await fetch(`${DIARIZATION_URL}/jobs/${job_id}`, {
        headers: DIARIZATION_API_KEY
          ? { "X-API-Key": DIARIZATION_API_KEY }
          : {},
      });
      if (!pollRes.ok) throw new Error(`Job poll failed: ${pollRes.status}`);

      const job = (await pollRes.json()) as {
        status: "queued" | "running" | "done" | "error";
        result: { segments: DiarizationSegment[] } | null;
        error: string | null;
      };

      if (job.status === "done") {
        pollResult = job.result;
        break;
      }
      if (job.status === "error")
        throw new Error(job.error ?? "Diarization job failed");
    }

    if (!pollResult) throw new Error("Diarization timed out");

    const srtContent = diarizationToSrt(pollResult.segments);

    /* ── Save SRT and upload to R2 ──────────────────────────────────── */
    await writeFile(srtPath, srtContent, "utf-8");

    if (USE_R2) {
      await uploadFromPath(srtFileName, srtPath);
      unlink(srtPath).catch(() => {});
    }

    await updateTask(taskId, {
      status: "done",
      progress: 100,
      error: null,
      captionsFile: srtFileName,
    });

    log.info(
      { taskId, inputFile, srtFileName, segments: pollResult.segments.length },
      "Diarization complete",
    );
  } catch (err) {
    log.error({ err, taskId, inputFile }, "Diarization failed");
    await refundOnFailure();
    await updateTask(taskId, {
      status: "error",
      progress: 0,
      error: {
        code: "DOWNLOAD_FAILED",
        message: err instanceof Error ? err.message : String(err),
      },
    }).catch(() => {});
    if (USE_R2) unlink(srtPath).catch(() => {});
  } finally {
    if (tempInputPath) unlink(tempInputPath).catch(() => {});
  }
}

export async function POST(request: NextRequest) {
  let body: {
    file?: string;
    duration?: number;
    taskId?: string;
    maxWords?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { file: inputFile, duration } = body;
  let { taskId } = body;

  /* Clamp words-per-row to the supported 1-10 range; default to 4. */
  const maxWords = Math.min(
    10,
    Math.max(1, Math.round(Number(body.maxWords) || 4)),
  );

  if (!inputFile || typeof inputFile !== "string") {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (inputFile.includes("/") || inputFile.includes("..")) {
    log.warn({ inputFile }, "Path traversal attempt in inputFile");
    return NextResponse.json({ error: "Invalid file" }, { status: 400 });
  }
  if (!duration || duration <= 0) {
    return NextResponse.json({ error: "Invalid duration" }, { status: 400 });
  }
  if (taskId && !/^[0-9a-f]{24}$/i.test(taskId)) {
    return NextResponse.json({ error: "Invalid taskId" }, { status: 400 });
  }

  const creditsKey = getCreditsKey(request);
  if (!creditsKey) return creditsErrorResponse("NO_CREDITS_KEY");

  sweepTmpFiles();

  const cost = Math.ceil(duration * DIARIZE_CREDITS_PER_SECOND);
  const creditResult = await requireCredits(creditsKey, cost);
  if (!creditResult.ok) return creditsErrorResponse(creditResult.error);

  /* Resolve (or create) the task document used to report progress. */
  const existing = taskId ? await getTask(taskId) : null;
  if (!existing) {
    const tempTask = await createTask({ url: "opfs://local" });
    taskId = tempTask._id.toString();
    await updateTask(taskId, { file: inputFile });
  }

  await updateTask(taskId!, { status: "diarizing", progress: 0, error: null });

  void runDiarizeJob(taskId!, inputFile, creditsKey, cost, maxWords);

  log.info(
    { taskId, inputFile, duration, cost, maxWords },
    "Diarization job started",
  );
  return NextResponse.json(
    { taskId, creditsRemaining: creditResult.remaining },
    { status: 202 },
  );
}

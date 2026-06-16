import { NextRequest, NextResponse } from "next/server";
import { join } from "node:path";
import { access, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createTask, getTask, updateTask } from "@/lib/video-task-db";
import type { TaskStatus } from "@/lib/types";
import {
  getCreditsKey,
  requireCredits,
  refundCredits,
  creditsErrorResponse,
} from "@/lib/credits-middleware";
import {
  interpolateFps,
  convertToH264,
  convertToH265,
  removeBlackBars,
  burnSubtitles,
  scaleDown,
  type AnimationOptions,
} from "@repo/helpers/ffmpeg-helper";
import {
  calculateOperationCredits,
  getVideoMetaFromFile,
  interpolateFpsCost,
} from "@/lib/operation-credits";
import { USE_R2, uploadFromPath, downloadToPath } from "@/lib/r2";
import { sweepTmpFiles } from "@/lib/tmp-cleanup";
import {
  translateSrt,
  srtCacheKey,
  TRANSLATION_CREDITS,
} from "@/lib/translate-srt";
import logger from "@/lib/logger";

const log = logger.child({ module: "api/server-processing" });

const NODE_ENV = process.env.NODE_ENV?.trim() ?? "development";
const IS_PROD = NODE_ENV === "production";
const MEDIA_DIR = IS_PROD ? "/app/media" : "./public/media";
const TEMP_DIR = "/tmp";
const FFMPEG_BINARY = "ffmpeg";

const VALID_OPS = [
  "interpolateFps",
  "removeBlackBars",
  "convertToH264",
  "convertToH265",
  "burnSubtitles",
  "scaleDown",
] as const;

type ProcessingOp = (typeof VALID_OPS)[number];

const STATUS_BY_OP: Record<ProcessingOp, TaskStatus> = {
  interpolateFps: "processing",
  removeBlackBars: "processing",
  convertToH264: "converting",
  convertToH265: "converting",
  burnSubtitles: "burning",
  scaleDown: "processing",
};

async function runFfmpegJob(
  taskId: string,
  op: ProcessingOp,
  inputFileName: string,
  params: Record<string, unknown>,
  creditsKey: string,
  opCost: number,
  preDownloadedInput?: string,
  translation?: { langName: string; cachedSrt: string | null; cacheKey: string },
): Promise<void> {
  const refundOnFailure = () =>
    refundCredits(creditsKey, opCost).catch((err: unknown) =>
      log.error({ err, taskId }, "Failed to refund credits after job failure"),
    );

  // In R2 mode the input was pre-downloaded to TEMP_DIR; otherwise read from MEDIA_DIR.
  const inputPath = preDownloadedInput ?? join(MEDIA_DIR, inputFileName);
  const ext = inputFileName.split(".").pop() ?? "mp4";
  const outputFileName = `${randomUUID()}.${ext}`;
  // In R2 mode write output to TEMP_DIR so we can upload it; otherwise write to MEDIA_DIR.
  const outputPath = USE_R2
    ? join(TEMP_DIR, outputFileName)
    : join(MEDIA_DIR, outputFileName);

  let lastProgress = -1;
  const onProgress = (pct: number) => {
    const rounded = Math.round(pct);
    if (rounded > lastProgress) {
      lastProgress = rounded;
      updateTask(taskId, { progress: rounded }).catch(() => {});
    }
  };

  try {
    switch (op) {
      case "interpolateFps":
        await interpolateFps({
          inputPath,
          outputPath,
          targetFps: Number(params.fps ?? 60),
          ffmpegBinary: FFMPEG_BINARY,
          onProgress,
        });
        break;

      case "convertToH264":
        await convertToH264({
          inputPath,
          outputPath,
          ffmpegBinary: FFMPEG_BINARY,
          onProgress,
        });
        break;

      case "convertToH265":
        await convertToH265({
          inputPath,
          outputPath,
          ffmpegBinary: FFMPEG_BINARY,
          onProgress,
        });
        break;

      case "removeBlackBars":
        await removeBlackBars({
          inputPath,
          outputPath,
          ffmpegBinary: FFMPEG_BINARY,
          onProgress,
        });
        break;

      case "burnSubtitles": {
        // Optional server-side translation: runs before the burn so it is
        // resume-proof (a reload just re-polls the same task) and idempotent
        // (the translated SRT is cached on the task, keyed by language + source
        // hash, so a reload/retry never re-runs or re-charges the LLM call).
        let srt = String(params.srtContent ?? "");
        if (translation) {
          if (translation.cachedSrt) {
            srt = translation.cachedSrt;
          } else {
            await updateTask(taskId, { status: "translating" }).catch(() => {});
            srt = await translateSrt({
              srtContent: srt,
              langName: translation.langName,
            });
            await updateTask(taskId, {
              translatedSrt: srt,
              translatedSrtKey: translation.cacheKey,
            }).catch(() => {});
          }
          await updateTask(taskId, { status: "burning" }).catch(() => {});
        }
        await burnSubtitles({
          inputPath,
          outputPath,
          srtContent: srt.toUpperCase(),
          alignment: Number(params.alignment ?? 2),
          marginV: Number(params.marginV ?? 40),
          fontSize: Number(params.fontSize ?? 16),
          bold: Boolean(params.bold),
          italic: Boolean(params.italic),
          primaryColour: String(params.primaryColour ?? "&H00FFFFFF"),
          backColour: String(params.backColour ?? "&H70000000"),
          borderStyle: Number(params.borderStyle ?? 3) as 1 | 3,
          outline: Number(params.outline ?? 0),
          animation: (params.animation ?? {}) as AnimationOptions,
          ffmpegBinary: FFMPEG_BINARY,
          onProgress,
        });
        break;
      }

      case "scaleDown":
        await scaleDown({
          inputPath,
          outputPath,
          targetHeight: Number(params.targetHeight ?? 720),
          ffmpegBinary: FFMPEG_BINARY,
          onProgress,
        });
        break;
    }

    const extraFields: Partial<{ isH265: boolean }> = {};
    if (op === "convertToH265") extraFields.isH265 = true;
    if (op === "convertToH264") extraFields.isH265 = false;

    const probed = await getVideoMetaFromFile(outputPath);
    const updatedCredits = calculateOperationCredits({
      width: probed.width,
      height: probed.height,
      durationSeconds: probed.durationSeconds,
    });

    if (USE_R2) {
      await updateTask(taskId, { status: "uploading", progress: 100 }).catch(
        () => {},
      );
      try {
        await uploadFromPath(outputFileName, outputPath);
      } catch (uploadErr) {
        log.error(
          { err: uploadErr, taskId, outputFileName },
          "R2 upload of FFmpeg output failed",
        );
        await refundOnFailure();
        await updateTask(taskId, {
          status: "error",
          error: {
            code: "DOWNLOAD_FAILED",
            message: "Failed to upload processed file to storage",
          },
          progress: 0,
        }).catch(() => {});
        unlink(outputPath).catch(() => {});
        if (preDownloadedInput) unlink(preDownloadedInput).catch(() => {});
        return;
      }
      // Clean up temp files after successful upload
      unlink(outputPath).catch(() => {});
      if (preDownloadedInput) unlink(preDownloadedInput).catch(() => {});
    }

    await updateTask(taskId, {
      status: "done",
      file: outputFileName,
      progress: 100,
      error: null,
      ...(probed.width != null ? { width: probed.width } : {}),
      ...(probed.height != null ? { height: probed.height } : {}),
      ...(probed.durationSeconds != null
        ? { duration: probed.durationSeconds }
        : {}),
      operationCredits: updatedCredits,
      ...extraFields,
    });

    log.info({ taskId, op, outputFileName }, "FFmpeg job completed");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err, taskId, op }, "FFmpeg job failed");
    await refundOnFailure();
    await updateTask(taskId, {
      status: "error",
      error: { code: "DOWNLOAD_FAILED", message },
      progress: 0,
    }).catch(() => {});
    unlink(outputPath).catch(() => {});
    if (preDownloadedInput) unlink(preDownloadedInput).catch(() => {});
  }
}

export async function POST(request: NextRequest) {
  let body: {
    op?: string;
    taskId?: string;
    params?: Record<string, unknown>;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    log.warn("Failed to parse request body as JSON");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { op, params } = body;
  let { taskId } = body;

  const creditsKey = getCreditsKey(request);
  if (!creditsKey) return creditsErrorResponse("NO_CREDITS_KEY");

  sweepTmpFiles();

  if (!op || !params) {
    log.warn({ op, hasParams: !!params }, "Missing op or params");
    return NextResponse.json(
      { error: "Missing op or params" },
      { status: 400 },
    );
  }

  if (!VALID_OPS.includes(op as ProcessingOp)) {
    log.warn({ op }, "Unknown processing op");
    return NextResponse.json(
      { error: `Invalid op. Valid: ${VALID_OPS.join(", ")}` },
      { status: 400 },
    );
  }

  if (taskId && !/^[0-9a-f]{24}$/i.test(taskId)) {
    log.warn({ taskId }, "Invalid taskId format");
    return NextResponse.json({ error: "Invalid taskId" }, { status: 400 });
  }

  const inputFileParam =
    typeof params.inputFile === "string" ? params.inputFile : undefined;

  if (
    inputFileParam &&
    (inputFileParam.includes("/") || inputFileParam.includes(".."))
  ) {
    log.warn({ inputFileParam }, "Path traversal attempt in inputFile");
    return NextResponse.json({ error: "Invalid inputFile" }, { status: 400 });
  }

  let task = taskId ? await getTask(taskId) : null;

  if (!task) {
    if (!inputFileParam) {
      log.warn({ taskId, op }, "Task not found and no inputFile provided");
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    const tempTask = await createTask({ url: "opfs://local" });
    const newId = tempTask._id.toString();
    await updateTask(newId, { file: inputFileParam });
    task = { ...tempTask, file: inputFileParam };
    taskId = newId;
    log.info(
      { originalTaskId: body.taskId, newTaskId: newId, op },
      "Created temp task for OPFS video",
    );
  }

  const inputFile = inputFileParam ?? task.file;
  if (!inputFile) {
    log.warn({ taskId }, "No input file available");
    return NextResponse.json(
      { error: "No input file available" },
      { status: 422 },
    );
  }

  /* ── Resolve input path (staged in /tmp or download from R2) ──────────── */
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
        return NextResponse.json(
          { error: "Failed to fetch input file" },
          { status: 500 },
        );
      }
    }
  }

  /* ── Dynamic credit cost ─────────────────────────────────────────────── */
  const probeInputPath = tempInputPath ?? join(MEDIA_DIR, inputFile);
  const inputMeta = await getVideoMetaFromFile(probeInputPath);
  const opCredits = calculateOperationCredits({
    width: inputMeta.width,
    height: inputMeta.height,
    durationSeconds: inputMeta.durationSeconds,
  });

  const OP_CREDIT_KEYS: Partial<Record<ProcessingOp, keyof typeof opCredits>> =
    {
      removeBlackBars: "removeBlackBars",
      convertToH264: "convertToH264",
      convertToH265: "convertToH265",
      burnSubtitles: "burnSubtitles",
      scaleDown: "scaleDown",
    };

  let opCost: number;
  if (op === "interpolateFps") {
    opCost = interpolateFpsCost(
      opCredits,
      Number(params.fps ?? 60),
      task.sourceFps ?? null,
    );
  } else {
    const key = OP_CREDIT_KEYS[op as ProcessingOp];
    opCost = key ? opCredits[key] : opCredits.convertToH264;
  }

  /* ── Optional server-side subtitle translation (burnSubtitles only) ────── */
  // Translating inside the burn task makes it resume-proof; the result is
  // cached on the task doc (keyed by language + source hash) so a reload,
  // re-dispatch, or retry reuses it and never charges the credit twice.
  let translation:
    | { langName: string; cachedSrt: string | null; cacheKey: string }
    | undefined;
  if (op === "burnSubtitles" && params.translate) {
    const srtSource = String(params.srtContent ?? "");
    const langName = String(params.translateLang ?? params.translateTo ?? "");
    const cacheKey = srtCacheKey(srtSource, langName);
    const cachedSrt =
      task.translatedSrt && task.translatedSrtKey === cacheKey
        ? task.translatedSrt
        : null;
    translation = { langName, cachedSrt, cacheKey };
    // Only charge for translation when there is no usable cached result.
    if (!cachedSrt) opCost += TRANSLATION_CREDITS;
  }

  const creditResult = await requireCredits(creditsKey, opCost);
  if (!creditResult.ok) {
    // Clean up temp file if credit check fails
    if (tempInputPath) unlink(tempInputPath).catch(() => {});
    return creditsErrorResponse(creditResult.error);
  }
  /* ────────────────────────────────────────────────────────────────────── */

  // Surface the "translating" phase up front when a fresh translation will run.
  const activeStatus: TaskStatus =
    translation && !translation.cachedSrt
      ? "translating"
      : STATUS_BY_OP[op as ProcessingOp];
  await updateTask(taskId!, { status: activeStatus, progress: 0, error: null });

  const jobParams = { ...params, inputFile };
  void runFfmpegJob(
    taskId!,
    op as ProcessingOp,
    inputFile,
    jobParams,
    creditsKey,
    opCost,
    tempInputPath,
    translation,
  );

  log.info({ taskId, op, inputFile }, "Server FFmpeg job started");
  return NextResponse.json(
    { taskId, creditsRemaining: creditResult.remaining },
    { status: 201 },
  );
}

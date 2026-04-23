/**
 * WS agent — long-lived daemon, connects to ws-broker, receives FFmpeg jobs,
 * uploads results back to video-downloader.
 *
 * Uses only Node.js 22 built-ins: WebSocket, fetch, fs, path, os, crypto.
 */
import { readConfig } from './config.js';
import {
  interpolateFps,
  removeBlackBars,
  convertToH264,
  burnSubtitles,
} from './ffmpeg-ops.js';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, unlink, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';

type WsOp =
  | 'interpolateFps'
  | 'removeBlackBars'
  | 'convertToH264'
  | 'burnSubtitles';

interface JobMessage {
  type: 'job';
  jobId: string;
  op: WsOp;
  params: {
    taskId: string;
    inputFile: string;
    fps?: number;
    subtitlesFile?: string;
    srtContent?: string;
    alignment?: number;
    marginV?: number;
    fontSize?: number;
    bold?: boolean;
    italic?: boolean;
    primaryColour?: string;
    backColour?: string;
    borderStyle?: number;
    outline?: number;
    animation?: Record<string, unknown>;
  };
}

type ServerMessage = { type: 'ack' } | { type: 'pong' } | JobMessage;

const VIDEO_DOWNLOADER_URL =
  process.env.VIDEO_DOWNLOADER_URL ?? 'https://vd2.iguzman.com.mx';

const RECONNECT_DELAY_MS = 5_000;
const PING_INTERVAL_MS = 30_000;

const config = readConfig();

function log(level: 'info' | 'warn' | 'error', msg: string, extra?: object) {
  process[level === 'error' ? 'stderr' : 'stdout'].write(
    JSON.stringify({ time: new Date().toISOString(), level, msg, ...extra }) +
      '\n',
  );
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body)
    throw new Error(`Download failed: ${res.status} ${url}`);
  await pipeline(
    Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]),
    createWriteStream(destPath),
  );
}

async function uploadFile(
  filePath: string,
  uploadUrl: string,
): Promise<string> {
  const { size } = await stat(filePath);
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    // @ts-expect-error Node.js fetch accepts ReadableStream + duplex
    body: createReadStream(filePath),
    headers: { 'Content-Length': String(size) },
    duplex: 'half',
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${uploadUrl}`);
  const data = (await res.json()) as { file?: string };
  if (!data.file) throw new Error('Upload response missing file field');
  return data.file;
}

async function handleJob(ws: WebSocket, msg: JobMessage): Promise<void> {
  const { jobId, op, params } = msg;
  const ext = extname(params.inputFile) || '.mp4';
  const inputPath = join(tmpdir(), `sve-in-${randomUUID()}${ext}`);
  const outputPath = join(tmpdir(), `sve-out-${randomUUID()}${ext}`);
  const sendProgress = (p: number) =>
    ws.send(JSON.stringify({ type: 'progress', jobId, percent: p }));

  try {
    log('info', 'Job started', { jobId, op });

    await downloadFile(
      `${VIDEO_DOWNLOADER_URL}/api/media/${params.inputFile}`,
      inputPath,
    );
    sendProgress(5);

    if (op === 'interpolateFps') {
      await interpolateFps({
        inputPath,
        outputPath,
        targetFps: params.fps ?? 60,
        onProgress: sendProgress,
      });
    } else if (op === 'removeBlackBars') {
      await removeBlackBars({
        inputPath,
        outputPath,
        onProgress: sendProgress,
      });
    } else if (op === 'convertToH264') {
      await convertToH264({ inputPath, outputPath, onProgress: sendProgress });
    } else if (op === 'burnSubtitles') {
      let srtContent: string;
      if (params.srtContent) {
        srtContent = params.srtContent;
      } else if (params.subtitlesFile) {
        const subPath = join(tmpdir(), `sve-sub-${randomUUID()}.srt`);
        await downloadFile(
          `${VIDEO_DOWNLOADER_URL}/api/media/${params.subtitlesFile}`,
          subPath,
        );
        srtContent = await readFile(subPath, 'utf8');
        await unlink(subPath).catch(() => {});
      } else {
        throw new Error('burnSubtitles requires srtContent or subtitlesFile');
      }
      await burnSubtitles({
        inputPath,
        outputPath,
        srtContent,
        alignment: params.alignment,
        marginV: params.marginV,
        fontSize: params.fontSize,
        bold: params.bold,
        italic: params.italic,
        primaryColour: params.primaryColour,
        backColour: params.backColour,
        borderStyle: params.borderStyle,
        outline: params.outline,
        animation: params.animation as Parameters<typeof burnSubtitles>[0]['animation'],
        onProgress: sendProgress,
      });
    } else {
      throw new Error(`Unknown op: ${op as string}`);
    }

    const newFile = await uploadFile(
      outputPath,
      `${VIDEO_DOWNLOADER_URL}/api/media/${params.inputFile}`,
    );

    log('info', 'Job done', { jobId, outputFile: newFile });
    ws.send(JSON.stringify({ type: 'done', jobId, outputFile: newFile }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log('error', 'Job failed', { jobId, error: message });
    ws.send(JSON.stringify({ type: 'error', jobId, error: message }));
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

function connect(): void {
  const ws = new WebSocket(config.wsBrokerUrl);
  let pingTimer: ReturnType<typeof setInterval> | null = null;

  ws.addEventListener('open', () => {
    log('info', 'Connected to ws-broker');
    ws.send(JSON.stringify({ type: 'auth', uuid: config.uuid }));
    pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: 'ping' }));
    }, PING_INTERVAL_MS);
  });

  ws.addEventListener('message', (event) => {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(event.data as string) as ServerMessage;
    } catch {
      return;
    }

    if (msg.type === 'ack') {
      log('info', 'Authenticated', { uuid: config.uuid, label: config.label });
    } else if (msg.type === 'job') {
      handleJob(ws, msg).catch((err: unknown) => {
        log('error', 'Unhandled job error', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }
  });

  ws.addEventListener('close', (event) => {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    log('warn', 'Disconnected, reconnecting…', { code: event.code });
    setTimeout(connect, RECONNECT_DELAY_MS);
  });

  ws.addEventListener('error', () => {
    log('error', 'WebSocket error — will reconnect');
  });
}

log('info', 'ws-agent starting', {
  uuid: config.uuid,
  broker: config.wsBrokerUrl,
});
connect();

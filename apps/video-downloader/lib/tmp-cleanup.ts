import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import logger from '@/lib/logger';

const log = logger.child({ module: 'tmp-cleanup' });

const TEMP_DIR = '/tmp';

// Files older than this are considered orphaned. The longest-running job
// (diarization) is capped at ~10 min, so 2 h leaves a wide safety margin.
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

// Each process sweeps at most this often, so the cost stays negligible even
// when called on every request.
const SWEEP_INTERVAL_MS = 30 * 60 * 1000;

// Only touch files we ourselves stage in /tmp: a UUID name + extension.
// Anything else in /tmp is left untouched.
const STAGED_FILE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/i;

let lastSweep = 0;

/**
 * Fire-and-forget cleanup of orphaned staged files in /tmp.
 *
 * Uploads staged via `?tmp=1`, R2 inputs downloaded for processing, and the
 * temp outputs of FFmpeg/diarization jobs all live in `/tmp`. The happy path
 * deletes them, but an upload that is never processed (user abandons the tab)
 * leaves a file behind until the pod restarts. This removes those leftovers.
 *
 * Self-throttling: a no-op unless at least SWEEP_INTERVAL_MS has elapsed since
 * the last sweep in this process, so it is safe to call on every request.
 */
export function sweepTmpFiles(): void {
  const now = Date.now();
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;

  void (async () => {
    let entries: string[];
    try {
      entries = await readdir(TEMP_DIR);
    } catch (err) {
      log.warn({ err }, 'tmp-cleanup - failed to read /tmp');
      return;
    }

    await Promise.all(
      entries.map(async (name) => {
        if (!STAGED_FILE_RE.test(name)) return;
        const filePath = join(TEMP_DIR, name);
        try {
          const info = await stat(filePath);
          if (!info.isFile() || now - info.mtimeMs <= MAX_AGE_MS) return;
          await unlink(filePath);
          log.info({ file: name }, 'tmp-cleanup - removed orphaned staged file');
        } catch {
          // File may have been removed concurrently — ignore.
        }
      }),
    );
  })();
}

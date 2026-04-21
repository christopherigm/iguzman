import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import * as os from 'os';

/* ── Public types ────────────────────────────────────────────────────── */

export interface CpuStats {
  usagePercent: number;
  coreCount: number;
  model: string;
}

export interface MemoryStats {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usagePercent: number;
}

export interface DiskStats {
  filesystem: string;
  mountpoint: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usagePercent: number;
}

export interface NetworkStats {
  interface: string;
  rxBytes: number;
  txBytes: number;
  /** Bytes received per second since the last sample. 0 on the first reading. */
  rxBytesPerSec: number;
  /** Bytes transmitted per second since the last sample. 0 on the first reading. */
  txBytesPerSec: number;
}

export interface SystemStats {
  cpu: CpuStats;
  memory: MemoryStats;
  disk: DiskStats[];
  network: NetworkStats[];
  /** System uptime in seconds. */
  uptime: number;
  /** 1-minute, 5-minute, and 15-minute load averages. */
  loadAverage: [number, number, number];
  timestamp: number;
  platform: string;
}

export interface GetSystemStatsOptions {
  /**
   * How long (in ms) to wait between the two CPU samples used to compute usage.
   * A longer window gives a more accurate reading. Default 300.
   */
  cpuSampleMs?: number;
  /** Whether to run `df` to collect disk stats. Default true. */
  includeDisk?: boolean;
  /** Whether to read `/proc/net/dev` for network I/O. Default true. */
  includeNetwork?: boolean;
}

export interface WatchSystemStatsOptions extends Omit<GetSystemStatsOptions, 'cpuSampleMs'> {
  /**
   * How often (in seconds) to emit a new `SystemStats` snapshot.
   * CPU and network rates are computed across the full interval. Default 2.
   */
  intervalSec?: number;
  /** Called with fresh stats after every interval. */
  onStats: (stats: SystemStats) => void;
  /** Called if an unexpected error occurs during a tick. */
  onError?: (err: Error) => void;
}

/* ── Internal: CPU ───────────────────────────────────────────────────── */

interface CpuSample {
  idle: number;
  total: number;
}

function takeCpuSample(): CpuSample[] {
  return os.cpus().map((cpu) => {
    const t = cpu.times;
    return {
      idle: t.idle,
      total: t.user + t.nice + t.sys + t.idle + t.irq,
    };
  });
}

function computeCpuUsage(before: CpuSample[], after: CpuSample[]): number {
  let idleDelta = 0;
  let totalDelta = 0;
  const len = Math.min(before.length, after.length);
  for (let i = 0; i < len; i++) {
    idleDelta += after[i]!.idle - before[i]!.idle;
    totalDelta += after[i]!.total - before[i]!.total;
  }
  if (totalDelta === 0) return 0;
  return Math.min(100, Math.max(0, Math.round((1 - idleDelta / totalDelta) * 100)));
}

/* ── Internal: Memory ────────────────────────────────────────────────── */

function readMemory(): MemoryStats {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return {
    totalBytes: total,
    usedBytes: used,
    freeBytes: free,
    usagePercent: total > 0 ? Math.round((used / total) * 100) : 0,
  };
}

/* ── Internal: Disk via `df` ─────────────────────────────────────────── */

function runDf(): Promise<DiskStats[]> {
  return new Promise((resolve) => {
    // -P: POSIX output (portable across Linux + macOS), 1 KB blocks
    const proc = spawn('df', ['-P']);
    let output = '';

    proc.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    proc.on('error', () => resolve([]));
    proc.on('close', () => {
      const lines = output.trim().split('\n').slice(1);
      const results: DiskStats[] = [];

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 6) continue;

        const [filesystem, blocksStr, usedStr, availStr, , mountpoint] = parts;
        if (!filesystem || !blocksStr || !usedStr || !availStr || !mountpoint) continue;

        // Only include real block devices; skip virtual/pseudo filesystems
        if (!filesystem.startsWith('/dev/') && !filesystem.startsWith('//')) continue;

        const totalBytes = Number(blocksStr) * 1024;
        const usedBytes = Number(usedStr) * 1024;
        const freeBytes = Number(availStr) * 1024;

        results.push({
          filesystem,
          mountpoint,
          totalBytes,
          usedBytes,
          freeBytes,
          usagePercent: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0,
        });
      }

      resolve(results);
    });
  });
}

/* ── Internal: Network via /proc/net/dev ─────────────────────────────── */

interface NetCounter {
  interface: string;
  rxBytes: number;
  txBytes: number;
}

function readNetCounters(): NetCounter[] {
  const path = '/proc/net/dev';
  if (!existsSync(path)) return [];

  try {
    // Format: <iface>: rx_bytes rx_packets ... (8 rx fields) tx_bytes tx_packets ...
    const lines = readFileSync(path, 'utf8').trim().split('\n').slice(2);
    return lines.flatMap((line) => {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) return [];
      const iface = line.slice(0, colonIdx).trim();
      if (iface === 'lo') return [];
      const fields = line.slice(colonIdx + 1).trim().split(/\s+/);
      return [{ interface: iface, rxBytes: Number(fields[0] ?? 0), txBytes: Number(fields[8] ?? 0) }];
    });
  } catch {
    return [];
  }
}

function computeNetworkStats(
  before: NetCounter[],
  after: NetCounter[],
  deltaMs: number,
): NetworkStats[] {
  const deltaS = Math.max(0.001, deltaMs / 1000);
  return after.map((a) => {
    const b = before.find((x) => x.interface === a.interface);
    const rxDelta = b ? Math.max(0, a.rxBytes - b.rxBytes) : 0;
    const txDelta = b ? Math.max(0, a.txBytes - b.txBytes) : 0;
    return {
      interface: a.interface,
      rxBytes: a.rxBytes,
      txBytes: a.txBytes,
      rxBytesPerSec: Math.round(rxDelta / deltaS),
      txBytesPerSec: Math.round(txDelta / deltaS),
    };
  });
}

/* ── Internal: assemble a full snapshot ─────────────────────────────── */

function buildStats(
  cpuBefore: CpuSample[],
  cpuAfter: CpuSample[],
  netBefore: NetCounter[],
  netAfter: NetCounter[],
  disk: DiskStats[],
  deltaMs: number,
): SystemStats {
  const cpus = os.cpus();
  return {
    cpu: {
      usagePercent: computeCpuUsage(cpuBefore, cpuAfter),
      coreCount: cpus.length,
      model: cpus[0]?.model ?? 'Unknown',
    },
    memory: readMemory(),
    disk,
    network: netBefore.length > 0 || netAfter.length > 0
      ? computeNetworkStats(netBefore, netAfter, deltaMs)
      : [],
    uptime: os.uptime(),
    loadAverage: os.loadavg() as [number, number, number],
    timestamp: Date.now(),
    platform: os.platform(),
  };
}

/* ── Public API ──────────────────────────────────────────────────────── */

/**
 * Collects a one-shot system snapshot.
 *
 * CPU usage is measured by sampling `os.cpus()` twice, separated by
 * `cpuSampleMs`. Network rates report 0 because there is no previous
 * sample to delta against; use `watchSystemStats` if you need rates.
 *
 * @returns A `SystemStats` snapshot.
 */
export async function getSystemStats(options: GetSystemStatsOptions = {}): Promise<SystemStats> {
  const {
    cpuSampleMs = 300,
    includeDisk = true,
    includeNetwork = true,
  } = options;

  const cpuBefore = takeCpuSample();
  const netBefore = includeNetwork ? readNetCounters() : [];
  const t0 = Date.now();

  const [disk] = await Promise.all([
    includeDisk ? runDf() : Promise.resolve([] as DiskStats[]),
    new Promise<void>((r) => setTimeout(r, cpuSampleMs)),
  ]);

  const deltaMs = Date.now() - t0;
  const cpuAfter = takeCpuSample();
  const netAfter = includeNetwork ? readNetCounters() : [];

  return buildStats(cpuBefore, cpuAfter, netBefore, netAfter, disk, deltaMs);
}

/**
 * Starts a polling monitor that emits `SystemStats` every `intervalSec` seconds.
 *
 * CPU usage and network rates are computed as deltas across the full interval,
 * so no extra sampling window is needed. The first event fires after one interval.
 *
 * @returns A `stop` function. Call it to cancel the monitor.
 *
 * @example
 * const stop = watchSystemStats({
 *   intervalSec: 2,
 *   onStats: (s) => console.log(`CPU ${s.cpu.usagePercent}%  RAM ${s.memory.usagePercent}%`),
 * });
 * // later …
 * stop();
 */
export function watchSystemStats(options: WatchSystemStatsOptions): () => void {
  const {
    intervalSec = 2,
    includeDisk = true,
    includeNetwork = true,
    onStats,
    onError,
  } = options;

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  let prevCpu = takeCpuSample();
  let prevNet: NetCounter[] = includeNetwork ? readNetCounters() : [];
  let prevTime = Date.now();

  const tick = async () => {
    if (stopped) return;
    try {
      const nowCpu = takeCpuSample();
      const nowNet: NetCounter[] = includeNetwork ? readNetCounters() : [];
      const now = Date.now();
      const delta = Math.max(1, now - prevTime);

      const disk = includeDisk ? await runDf() : ([] as DiskStats[]);

      if (!stopped) {
        onStats(buildStats(prevCpu, nowCpu, prevNet, nowNet, disk, delta));
      }

      prevCpu = nowCpu;
      prevNet = nowNet;
      prevTime = now;
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }

    if (!stopped) {
      timer = setTimeout(() => { void tick(); }, intervalSec * 1000);
    }
  };

  timer = setTimeout(() => { void tick(); }, intervalSec * 1000);

  return () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
  };
}

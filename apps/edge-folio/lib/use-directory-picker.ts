'use client';

import { useState, useCallback, useEffect } from 'react';

export type DirPickerStatus = 'idle' | 'picking' | 'scanning' | 'ready' | 'error';

export interface DirEntry {
  name: string;
  kind: 'file' | 'directory';
}

export interface ScannedDirectory {
  handle: FileSystemDirectoryHandle;
  name: string;
  codeFileCount: number;
  totalFileCount: number;
  topLevelEntries: DirEntry[];
}

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.kt', '.swift',
  '.c', '.cpp', '.cc', '.h', '.hpp', '.cs',
  '.rb', '.php', '.vue', '.svelte', '.scala',
  '.clj', '.ex', '.erl', '.hs', '.lua', '.sh',
  '.yaml', '.yml', '.toml', '.graphql', '.sql',
]);

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next',
  '__pycache__', '.cache', 'coverage', '.turbo', 'target',
  'vendor', '.idea', '.vscode', 'out', '.output',
]);

function getExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

async function scanDir(
  handle: FileSystemDirectoryHandle,
  depth: number,
): Promise<{ codeFiles: number; totalFiles: number }> {
  let codeFiles = 0;
  let totalFiles = 0;

  for await (const [name, entry] of handle.entries()) {
    if (entry.kind === 'directory') {
      if (SKIP_DIRS.has(name) || depth >= 3) continue;
      const sub = await scanDir(entry as FileSystemDirectoryHandle, depth + 1);
      codeFiles += sub.codeFiles;
      totalFiles += sub.totalFiles;
    } else {
      totalFiles++;
      if (CODE_EXTENSIONS.has(getExtension(name))) codeFiles++;
    }
  }

  return { codeFiles, totalFiles };
}

type ShowDirectoryPickerFn = (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle>;

export function useDirectoryPicker() {
  const [isSupported, setIsSupported] = useState(false);
  const [status, setStatus] = useState<DirPickerStatus>('idle');
  const [dir, setDir] = useState<ScannedDirectory | null>(null);

  useEffect(() => {
    setIsSupported('showDirectoryPicker' in window);
  }, []);

  const pick = useCallback(async () => {
    if (!isSupported) return;

    setStatus('picking');

    let handle: FileSystemDirectoryHandle;
    try {
      handle = await (window as unknown as { showDirectoryPicker: ShowDirectoryPickerFn }).showDirectoryPicker({ mode: 'read' });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setStatus('idle');
        return;
      }
      setStatus('error');
      return;
    }

    setStatus('scanning');

    try {
      const topLevelEntries: DirEntry[] = [];
      for await (const [name, entry] of handle.entries()) {
        if (!SKIP_DIRS.has(name)) {
          topLevelEntries.push({ name, kind: entry.kind });
        }
      }
      topLevelEntries.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      const { codeFiles, totalFiles } = await scanDir(handle, 0);

      setDir({
        handle,
        name: handle.name,
        codeFileCount: codeFiles,
        totalFileCount: totalFiles,
        topLevelEntries: topLevelEntries.slice(0, 12),
      });
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [isSupported]);

  const clear = useCallback(() => {
    setDir(null);
    setStatus('idle');
  }, []);

  return { isSupported, status, dir, pick, clear };
}

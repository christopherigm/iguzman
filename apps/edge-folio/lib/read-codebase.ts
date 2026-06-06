const MAX_CHARS = 12_000;

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

function getExt(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

async function collect(
  handle: FileSystemDirectoryHandle,
  path: string,
  depth: number,
  buf: string[],
  used: { chars: number },
): Promise<void> {
  if (used.chars >= MAX_CHARS) return;
  for await (const [name, entry] of handle.entries()) {
    if (used.chars >= MAX_CHARS) return;
    if (entry.kind === 'directory') {
      if (SKIP_DIRS.has(name) || depth >= 3) continue;
      await collect(entry as FileSystemDirectoryHandle, `${path}/${name}`, depth + 1, buf, used);
    } else {
      if (!CODE_EXTENSIONS.has(getExt(name))) continue;
      try {
        const file = await (entry as FileSystemFileHandle).getFile();
        const text = await file.text();
        const header = `\n// === ${path}/${name} ===\n`;
        const available = MAX_CHARS - used.chars - header.length;
        if (available <= 0) return;
        const chunk = text.slice(0, available);
        buf.push(header + chunk);
        used.chars += header.length + chunk.length;
      } catch {
        // skip unreadable files
      }
    }
  }
}

export async function readCodebase(handle: FileSystemDirectoryHandle): Promise<string> {
  const buf: string[] = [];
  const used = { chars: 0 };
  await collect(handle, handle.name, 0, buf, used);
  return buf.join('\n');
}

export interface DiarizationSegment {
  speaker: string;
  start: number;
  end: number;
  text: string;
  language?: string;
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return (
    `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:` +
    `${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`
  );
}

export function diarizationToSrt(segments: DiarizationSegment[]): string {
  const filtered = segments.filter((s) => s.text.trim());
  const blocks = filtered.map((s, i) => {
    const start = formatSrtTime(s.start);
    const end = formatSrtTime(s.end);
    return `${i + 1}\n${start} --> ${end}\n${s.text.trim()}`;
  });
  return blocks.join("\n\n") + (blocks.length ? "\n" : "");
}

export const DIARIZE_CREDITS_PER_SECOND = 5;

export function diarizeCreditCost(
  durationSeconds: number | null | undefined,
): number | null {
  if (!durationSeconds || durationSeconds <= 0) return null;
  return Math.ceil(durationSeconds * DIARIZE_CREDITS_PER_SECOND);
}

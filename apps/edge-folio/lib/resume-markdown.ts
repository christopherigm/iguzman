import type { TailoredBullet } from './applications';

const CATEGORY_LABELS: Record<string, string> = {
  impact: 'Impact',
  technical: 'Technical',
  leadership: 'Leadership',
  collaboration: 'Collaboration',
  other: 'Other',
};

function groupByCategory(bullets: TailoredBullet[]): Map<string, TailoredBullet[]> {
  const map = new Map<string, TailoredBullet[]>();
  for (const b of bullets) {
    const cat = b.category || 'other';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(b);
  }
  return map;
}

export interface ResumeMarkdownOptions {
  fullName: string;
  email: string;
  jobTitle: string;
  targetRole: string;
  targetCompany: string;
  tailoredBullets: TailoredBullet[];
  coverLetter?: string;
}

export function buildResumeMarkdown({
  fullName,
  email,
  jobTitle,
  targetRole,
  targetCompany,
  tailoredBullets,
  coverLetter,
}: ResumeMarkdownOptions): string {
  const lines: string[] = [];

  lines.push(`# ${fullName}`);
  const meta = [jobTitle, email].filter(Boolean).join(' · ');
  if (meta) lines.push(meta);
  lines.push('');
  lines.push('---');
  lines.push('');

  if (coverLetter) {
    lines.push('## Cover Letter');
    lines.push('');
    lines.push(coverLetter.trim());
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push(`## Experience — ${targetRole} at ${targetCompany}`);
  lines.push('');

  const grouped = groupByCategory(tailoredBullets);
  for (const [cat, bullets] of grouped) {
    lines.push(`### ${CATEGORY_LABELS[cat] ?? cat}`);
    lines.push('');
    for (const b of bullets) {
      lines.push(`- ${b.tailored_text}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function downloadMarkdown(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

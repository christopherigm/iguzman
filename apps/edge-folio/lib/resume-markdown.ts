import type { TailoredBullet } from './applications';
import type { WorkExperience, Education, Language, Project } from './career';
import type { Skill } from './matrix';

const CATEGORY_LABELS: Record<string, string> = {
  impact: 'Impact',
  technical: 'Technical',
  leadership: 'Leadership',
  collaboration: 'Collaboration',
  other: 'Other',
};

const DEGREE_LABELS: Record<string, string> = {
  bachelor: "Bachelor's",
  master: "Master's",
  phd: 'PhD / Doctorate',
  associate: 'Associate',
  certificate: 'Certificate',
  bootcamp: 'Bootcamp',
  other: 'Other',
};

const PROFICIENCY_LABELS: Record<string, string> = {
  native: 'Native',
  fluent: 'Fluent',
  professional: 'Professional proficiency',
  basic: 'Basic',
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

function formatDateRange(startDate: string, endDate: string | null, isCurrent: boolean): string {
  const fmt = (d: string) => {
    const [year, month] = d.split('-');
    return `${month}/${year}`;
  };
  const start = fmt(startDate);
  if (isCurrent) return `${start} - Present`;
  if (!endDate) return start;
  return `${start} - ${fmt(endDate)}`;
}

export interface ResumeMarkdownOptions {
  fullName: string;
  email: string;
  jobTitle: string;
  phone?: string;
  location?: string;
  githubUrl?: string;
  linkedinUrl?: string;
  summary?: string;
  targetRole: string;
  targetCompany: string;
  tailoredBullets: TailoredBullet[];
  coverLetter?: string;
  skills?: Pick<Skill, 'name' | 'proficiency'>[];
  workExperiences?: WorkExperience[];
  educations?: Education[];
  languages?: Language[];
  projects?: Project[];
}

export function buildResumeMarkdown({
  fullName,
  email,
  jobTitle,
  phone,
  location,
  githubUrl,
  linkedinUrl,
  summary,
  targetRole,
  targetCompany,
  tailoredBullets,
  coverLetter,
  skills,
  workExperiences,
  educations,
  languages,
  projects,
}: ResumeMarkdownOptions): string {
  const lines: string[] = [];

  lines.push(`# ${fullName}`);

  const contactParts = [jobTitle, email, phone, location].filter(Boolean);
  if (contactParts.length) lines.push(contactParts.join(' · '));

  const linkParts = [githubUrl, linkedinUrl].filter(Boolean);
  if (linkParts.length) lines.push(linkParts.join(' · '));

  lines.push('');
  lines.push('---');
  lines.push('');

  if (summary) {
    lines.push('## Professional Summary');
    lines.push('');
    lines.push(summary.trim());
    lines.push('');
  }

  if (coverLetter) {
    lines.push('## Cover Letter');
    lines.push('');
    lines.push(coverLetter.trim());
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // Bullets linked to a specific WE embed under that role; orphans go in Key Achievements
  const bulletsByWE = new Map<number, TailoredBullet[]>();
  const orphanBullets: TailoredBullet[] = [];
  for (const b of tailoredBullets) {
    if (b.work_experience_id) {
      if (!bulletsByWE.has(b.work_experience_id)) bulletsByWE.set(b.work_experience_id, []);
      bulletsByWE.get(b.work_experience_id)!.push(b);
    } else {
      orphanBullets.push(b);
    }
  }

  if (orphanBullets.length > 0) {
    lines.push(`## Key Achievements — ${targetRole} at ${targetCompany}`);
    lines.push('');
    const grouped = groupByCategory(orphanBullets);
    for (const [cat, bullets] of grouped) {
      lines.push(`### ${CATEGORY_LABELS[cat] ?? cat}`);
      lines.push('');
      for (const b of bullets) {
        lines.push(`- ${b.tailored_text}`);
      }
      lines.push('');
    }
  }

  if (skills && skills.length > 0) {
    const sorted = [...skills].sort((a, b) => b.proficiency - a.proficiency);
    lines.push('## Technical Skills');
    lines.push('');
    lines.push(sorted.map((s) => s.name).join(', '));
    lines.push('');
  }

  if (workExperiences && workExperiences.length > 0) {
    lines.push('## Professional Experience');
    lines.push('');
    for (const exp of workExperiences) {
      lines.push(`### ${exp.title} — ${exp.company}`);
      lines.push(`*${formatDateRange(exp.start_date, exp.end_date, exp.is_current)}${exp.location ? `  ·  ${exp.location}` : ''}*`);
      const expBullets = bulletsByWE.get(exp.id) ?? [];
      if (expBullets.length > 0) {
        lines.push('');
        for (const b of expBullets) {
          lines.push(`- ${b.tailored_text}`);
        }
      } else if (exp.description) {
        lines.push('');
        lines.push(exp.description);
      }
      lines.push('');
    }
  }

  if (projects && projects.length > 0) {
    lines.push('## Personal Projects');
    lines.push('');
    for (const proj of projects) {
      lines.push(`### ${proj.name}${proj.url ? ` — ${proj.url}` : ''}`);
      if (proj.tech_stack && proj.tech_stack.length > 0) {
        lines.push(`**Tech:** ${proj.tech_stack.map((ts) => ts.name).join(', ')}`);
      }
      if (proj.description) {
        lines.push('');
        lines.push(proj.description);
      }
      lines.push('');
    }
  }

  if (educations && educations.length > 0) {
    lines.push('## Education');
    lines.push('');
    for (const edu of educations) {
      const degreeLabel = DEGREE_LABELS[edu.degree] ?? edu.degree;
      const degree = edu.field_of_study ? `${degreeLabel} in ${edu.field_of_study}` : degreeLabel;
      lines.push(`### ${degree}`);
      const endYear = edu.is_current ? 'Present' : (edu.end_year ?? '');
      lines.push(`*${edu.institution}  ·  ${edu.start_year} - ${endYear}*`);
      lines.push('');
    }
  }

  if (languages && languages.length > 0) {
    lines.push('## Languages');
    lines.push('');
    for (const lang of languages) {
      lines.push(`- ${lang.name} (${PROFICIENCY_LABELS[lang.proficiency] ?? lang.proficiency})`);
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

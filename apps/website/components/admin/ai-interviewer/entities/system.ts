import type { InterviewerEntityConfig, ResearchQueryParams } from '../entity-config';

const BOOTSTRAP_PREFIX = 'Start the interview.';

function buildSystemResearchQuery({ brandPersona, chatHistory }: ResearchQueryParams): string {
  const firstAnswer = chatHistory
    .filter((m) => m.role === 'user' && !m.content.startsWith(BOOTSTRAP_PREFIX))
    .slice(0, 2)
    .map((m) => m.content)
    .join(' ');

  const subject = firstAnswer || brandPersona?.site_name || '';
  return `${subject} brand identity mission vision about company`.trim();
}

export const systemConfig: InterviewerEntityConfig = {
  entityType: 'system',
  targetFields: [
    'about', 'en_about',
    'mission', 'en_mission',
    'vision', 'en_vision',
    'slogan',
  ],
  proposalFieldLabels: {
    about: 'About (ES)',
    en_about: 'About (EN)',
    mission: 'Mission (ES)',
    en_mission: 'Mission (EN)',
    vision: 'Vision (ES)',
    en_vision: 'Vision (EN)',
    slogan: 'Slogan',
  },
  buildResearchQuery: buildSystemResearchQuery,
  fieldLengths: {
    about:   { paragraphs: 3, length: 'md' },
    mission: { paragraphs: 1, length: 'sm' },
    vision:  { paragraphs: 1, length: 'sm' },
    slogan:  null,
  },
  proposalSchema: `{
  "about": "<Spanish about section — translate from interview if needed>",
  "en_about": "<English about section — translate from interview if needed>",
  "mission": "<Spanish mission — translate from interview if needed>",
  "en_mission": "<English mission — translate from interview if needed>",
  "vision": "<Spanish vision — translate from interview if needed>",
  "en_vision": "<English vision — translate from interview if needed>",
  "slogan": "<slogan>",
  "justification": "<1-2 sentences explaining positioning>",
  "brand_alignment_notes": "<brand alignment concerns if any, or null>"
}`,
};

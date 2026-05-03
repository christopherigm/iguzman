import type { InterviewerEntityConfig } from '../entity-config';

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

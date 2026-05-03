import type { InterviewerEntityConfig } from '../entity-config';

export const serviceConfig: InterviewerEntityConfig = {
  entityType: 'service',
  targetFields: [
    'name', 'en_name',
    'description', 'en_description',
    'short_description', 'en_short_description',
    'price', 'duration', 'modality', 'sku',
  ],
  proposalFieldLabels: {
    name: 'Name (ES)',
    en_name: 'Name (EN)',
    description: 'Description (ES)',
    en_description: 'Description (EN)',
    short_description: 'Short Description (ES)',
    en_short_description: 'Short Description (EN)',
    price: 'Price',
    duration: 'Duration (min)',
    modality: 'Modality',
    sku: 'SKU',
  },
  buildResearchQuery({ values, brandPersona, entityLabel }) {
    const name = String(values['name'] ?? values['en_name'] ?? entityLabel);
    const brandName = brandPersona?.site_name ?? '';
    return `${name} service pricing description ${brandName}`.trim();
  },
  fieldLengths: {
    name:              null,
    description:       { paragraphs: 2, length: 'md' },
    short_description: { paragraphs: 1, length: 'xs' },
  },
  proposalSchema: `{
  "name": "<Spanish name — translate from interview if needed>",
  "en_name": "<English name — translate from interview if needed>",
  "description": "<Spanish description — translate from interview if needed>",
  "en_description": "<English description — translate from interview if needed>",
  "short_description": "<Spanish short summary — translate from interview if needed>",
  "en_short_description": "<English short summary — translate from interview if needed>",
  "price": <number>,
  "duration": <number in minutes or null>,
  "modality": "online" | "in_person" | "hybrid",
  "justification": "<1-2 sentences explaining pricing and positioning>",
  "brand_alignment_notes": "<brand alignment concerns if any, or null>"
}`,
};

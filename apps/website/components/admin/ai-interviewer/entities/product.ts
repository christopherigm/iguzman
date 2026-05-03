import type { InterviewerEntityConfig } from '../entity-config';

export const productConfig: InterviewerEntityConfig = {
  entityType: 'product',
  targetFields: [
    'name', 'en_name',
    'description', 'en_description',
    'short_description', 'en_short_description',
    'price', 'compare_price', 'sku',
  ],
  proposalFieldLabels: {
    name: 'Name (ES)',
    en_name: 'Name (EN)',
    description: 'Description (ES)',
    en_description: 'Description (EN)',
    short_description: 'Short Description (ES)',
    en_short_description: 'Short Description (EN)',
    price: 'Price',
    compare_price: 'Compare Price',
    sku: 'SKU',
  },
  proposalSchema: `{
  "name": "<Spanish name — translate from interview if needed>",
  "en_name": "<English name — translate from interview if needed>",
  "description": "<Spanish description, 2-3 sentences — translate from interview if needed>",
  "en_description": "<English description, 2-3 sentences — translate from interview if needed>",
  "short_description": "<Spanish one-sentence summary — translate from interview if needed>",
  "en_short_description": "<English one-sentence summary — translate from interview if needed>",
  "price": <number>,
  "sku": "<string or null>",
  "compare_price": <number or null>,
  "justification": "<1-2 sentences explaining pricing and positioning>",
  "brand_alignment_notes": "<brand alignment concerns if any, or null>"
}`,
};

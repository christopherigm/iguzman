export type AiEntityType = 'product' | 'service' | 'system';

export interface FieldLengthConfig {
  paragraphs: number;
  length: string;
}

export interface ResearchQueryParams {
  values: Record<string, unknown>;
  brandPersona: { site_name?: string } | null;
  entityLabel: string;
  chatHistory: { role: string; content: string }[];
}

export interface InterviewerEntityConfig {
  entityType: AiEntityType;
  targetFields: string[];
  proposalFieldLabels: Record<string, string>;
  /** Full JSON schema block embedded verbatim in the proposal generation prompt. */
  proposalSchema: string;
  /**
   * Per-field length defaults shown in the length options modal before proposal generation.
   * Keys are base field names (without en_ prefix). null = no length constraint (names, prices, single-line fields).
   */
  fieldLengths: Record<string, FieldLengthConfig | null>;
  /** Builds the web search query for market research. */
  buildResearchQuery: (params: ResearchQueryParams) => string;
}

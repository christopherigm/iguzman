export type AiEntityType = 'product' | 'service' | 'system';

export interface InterviewerEntityConfig {
  entityType: AiEntityType;
  targetFields: string[];
  proposalFieldLabels: Record<string, string>;
  /** Full JSON schema block embedded verbatim in the proposal generation prompt. */
  proposalSchema: string;
}

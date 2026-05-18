export interface CreditPack {
  id: string;
  credits: number;
  /** Price in USD cents */
  priceCents: number;
  label: string;
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: 'starter', credits: 25, priceCents: 299, label: 'Starter' },
  { id: 'basic', credits: 100, priceCents: 999, label: 'Basic' },
  { id: 'value', credits: 275, priceCents: 2499, label: 'Value' },
  { id: 'pro', credits: 600, priceCents: 4999, label: 'Pro' },
];

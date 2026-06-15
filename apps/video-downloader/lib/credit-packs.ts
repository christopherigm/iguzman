export interface CreditPack {
  id: string;
  credits: number;
  /** Price in USD cents */
  priceCents: number;
  label: string;
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: "basic", credits: 250, priceCents: 999, label: "Basic" },
  { id: "value", credits: 700, priceCents: 2499, label: "Value" },
  { id: "pro", credits: 1200, priceCents: 4999, label: "Pro" },
  { id: "max", credits: 2500, priceCents: 9999, label: "Max" },
];

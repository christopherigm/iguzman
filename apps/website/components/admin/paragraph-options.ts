export const PARAGRAPH_WORD_COUNTS: Record<string, { min: number; max: number }> = {
  xs:      { min: 25,  max: 40  },
  sm:      { min: 50,  max: 75  },
  md:      { min: 80,  max: 120 },
  'md-lg': { min: 130, max: 180 },
  lg:      { min: 200, max: 270 },
  xl:      { min: 300, max: 400 },
};

export const PARAGRAPH_LENGTH_STEPS = [
  { value: 'xs',    label: 'XS'  },
  { value: 'sm',    label: 'S'   },
  { value: 'md',    label: 'M'   },
  { value: 'md-lg', label: 'M-L' },
  { value: 'lg',    label: 'L'   },
  { value: 'xl',    label: 'XL'  },
];

export const PARAGRAPH_COUNT_STEPS = [1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }));

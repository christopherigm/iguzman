"use client";

import { useState } from "react";
import { Box } from "@repo/ui/core-elements/box";
import { Slider } from "@repo/ui/core-elements/slider";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";

/**
 * Word-count band selected by the length slider, keyed by step value. Shared by
 * every AI "enhance" button so the length options stay identical across pages.
 */
export const PARAGRAPH_WORD_COUNTS: Record<
  string,
  { min: number; max: number }
> = {
  xs: { min: 10, max: 20 },
  sm: { min: 25, max: 40 },
  md: { min: 50, max: 75 },
  "md-lg": { min: 80, max: 120 },
  lg: { min: 130, max: 180 },
  xl: { min: 200, max: 270 },
};

const PARAGRAPH_LENGTH_STEPS = [
  { value: "xs", label: "XS" },
  { value: "sm", label: "S" },
  { value: "md", label: "M" },
  { value: "md-lg", label: "M-L" },
  { value: "lg", label: "L" },
  { value: "xl", label: "XL" },
];

const PARAGRAPH_COUNT_STEPS = [1, 2, 3, 4, 5].map((n) => ({
  value: n,
  label: String(n),
}));

const DEFAULT_LENGTH = "sm";

/**
 * Resolved selection handed back to the caller, which owns the enhance prompt
 * wording. `minWords`/`maxWords` are the band for the chosen length step.
 */
export interface EnhanceOptions {
  paragraphs: number;
  minWords: number;
  maxWords: number;
}

/** Caller-supplied i18n strings (this component renders no hardcoded copy). */
export interface EnhanceOptionsLabels {
  title: string;
  text: string;
  paragraphs: string;
  length: string;
  /** Unit shown after the word range, e.g. "words/para". */
  wordsPerPara: string;
  /** Confirm button label. */
  ok: string;
  /** Cancel button label. */
  cancel: string;
}

interface Props {
  labels: EnhanceOptionsLabels;
  onConfirm: (opts: EnhanceOptions) => void;
  onCancel: () => void;
  defaultParagraphs?: number;
  defaultLength?: string;
}

/**
 * Modal that lets the user pick a paragraph count and a per-paragraph length
 * band before an AI "enhance" run. Reused by every enhance button so the
 * controls and word bands stay consistent; the caller receives the resolved
 * paragraph count + word range and builds the enhance prompt itself.
 */
export function EnhanceOptionsModal({
  labels,
  onConfirm,
  onCancel,
  defaultParagraphs = 1,
  defaultLength = DEFAULT_LENGTH,
}: Props) {
  const [paragraphs, setParagraphs] = useState(defaultParagraphs);
  const [length, setLength] = useState(defaultLength);
  const range = PARAGRAPH_WORD_COUNTS[length] ?? { min: 50, max: 75 };

  return (
    <ConfirmationModal
      title={labels.title}
      text={labels.text}
      okCallback={() =>
        onConfirm({ paragraphs, minWords: range.min, maxWords: range.max })
      }
      cancelCallback={onCancel}
      okLabel={labels.ok}
      cancelLabel={labels.cancel}
    >
      <Box display="flex" flexDirection="column" gap={20} paddingY={4}>
        <Slider
          steps={PARAGRAPH_COUNT_STEPS}
          value={paragraphs}
          onChange={(v) => setParagraphs(Number(v))}
          label={labels.paragraphs}
        />
        <Slider
          steps={PARAGRAPH_LENGTH_STEPS}
          value={length}
          onChange={(v) => setLength(String(v))}
          label={`${labels.length} (${range.min}-${range.max} ${labels.wordsPerPara})`}
        />
      </Box>
    </ConfirmationModal>
  );
}

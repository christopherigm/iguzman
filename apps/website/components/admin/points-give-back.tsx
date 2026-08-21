"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { TextInput } from "@repo/ui/core-elements/text-input";

/** How many paid purchases earn a free one, before the operator says otherwise.
 *  Ten is the punch card everyone has been handed at a counter, and it puts the
 *  giveaway at a round 10% of what the customer spends. */
export const DEFAULT_VISITS = 10;

/** What one purchase earns at the catalog's rate.
 *
 *  Points are whole numbers on the API (a `PositiveIntegerField`), and an item
 *  that earns nothing at all is not what anyone reaching for a calculator
 *  means - so the award floors at one point rather than rounding to zero on a
 *  cheap item under a small rate. */
export function awardFor(price: number, rate: number) {
  return Math.max(1, Math.round(price * rate));
}

/** The give-back the operator typed, as the whole number of purchases it means.
 *
 *  ⚠ **It rounds, and it has to.** `pointsPrice` is `visits × award` exactly,
 *  so the promise ("buy it ten times and the eleventh is free") is only true
 *  while those two divide - a fractional 6.67 purchases divides nothing. The
 *  effective percentage is quoted back from the rounded count, which is why the
 *  readout can disagree with the box by a fraction of a point. */
export function visitsFromPercent(percent: number) {
  return Math.max(1, Math.round(100 / percent));
}

/** What the tenant hands back, as a share of what the customer spends. It is
 *  `1 / visits` and nothing else - the earn rate does not enter into it. */
export function percentFromVisits(visits: number) {
  return 100 / visits;
}

const formatPercent = (value: number) => String(Math.round(value * 10) / 10);

export interface GiveBack {
  /** The whole number of purchases before one is free; `NaN` while unusable. */
  visits: number;
  ready: boolean;
  visitsInput: string;
  percentInput: string;
  setVisits: (raw: string) => void;
  setPercent: (raw: string) => void;
}

/**
 * The two ways an operator can state the same generosity: how many purchases
 * buy the next one, or what share of the spend they hand back. Editing either
 * box rewrites the other, so the pair can never say two different things.
 *
 * The **count** is the stored truth - see `visitsFromPercent` for why.
 */
export function useGiveBack(initialVisits = DEFAULT_VISITS): GiveBack {
  const [visitsInput, setVisitsInput] = useState(String(initialVisits));
  const [percentInput, setPercentInput] = useState(() =>
    formatPercent(percentFromVisits(initialVisits)),
  );

  const visits = Math.floor(Number(visitsInput));
  const ready = Number.isFinite(visits) && visits >= 1;

  return {
    visits,
    ready,
    visitsInput,
    percentInput,
    setVisits: (raw) => {
      setVisitsInput(raw);
      const next = Math.floor(Number(raw));
      if (Number.isFinite(next) && next >= 1)
        setPercentInput(formatPercent(percentFromVisits(next)));
    },
    setPercent: (raw) => {
      setPercentInput(raw);
      const next = Number(raw);
      if (Number.isFinite(next) && next > 0 && next <= 100)
        setVisitsInput(String(visitsFromPercent(next)));
    },
  };
}

/**
 * The linked pair of boxes `useGiveBack` drives, as both the per-item points
 * calculator and the catalog-wide Rewards bulk action render them.
 */
export function GiveBackFields({ giveBack }: { giveBack: GiveBack }) {
  const t = useTranslations("Admin");
  return (
    <Box
      display="grid"
      gap="12px"
      alignItems="start"
      styles={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
    >
      <TextInput
        label={t("pointsCalcVisits")}
        type="number"
        min={1}
        value={giveBack.visitsInput}
        onChange={giveBack.setVisits}
        helperText={t("pointsCalcVisitsHint")}
      />
      <TextInput
        label={t("pointsCalcGiveBack")}
        type="number"
        min={0}
        max={100}
        step={0.1}
        value={giveBack.percentInput}
        onChange={giveBack.setPercent}
        helperText={t("pointsCalcGiveBackHint")}
      />
    </Box>
  );
}

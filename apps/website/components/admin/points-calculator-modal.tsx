"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSession } from "@repo/auth/session-provider";
import { Box } from "@repo/ui/core-elements/box";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { Spinner } from "@repo/ui/core-elements/spinner";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Typography } from "@repo/ui/core-elements/typography";
import { getSystem } from "@/lib/admin-api";

const MUTED = "color-mix(in srgb, var(--foreground) 65%, transparent)";
const HAIRLINE = "color-mix(in srgb, var(--foreground) 12%, transparent)";

/** How many paid purchases earn a free one, before the operator says otherwise.
 *  Ten is the punch card everyone has been handed at a counter, and it puts the
 *  giveaway at a round 10% of what the customer spends. */
const DEFAULT_VISITS = 10;

export interface PointsCalculatorResult {
  /** The selling price, which the operator may have typed in the dialog. */
  price: string;
  /** What one purchase earns. */
  pointsAward: number;
  /** What one costs in points. */
  pointsPrice: number;
}

interface Props {
  /** The item's current selling price, as the form holds it. */
  price: unknown;
  /** Its cost price, when there is one - the margin the reward is paid out of. */
  costPrice: unknown;
  /** The item's currency code, for the figures the dialog quotes. */
  currency: string;
  onApply: (result: PointsCalculatorResult) => void;
  onCancel: () => void;
}

/** A right-aligned readout row: a label, and the figure it names. */
function ResultRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <Box
      display="flex"
      alignItems="baseline"
      justifyContent="space-between"
      gap="16px"
    >
      <Typography as="span" variant="body" color={strong ? undefined : MUTED}>
        {label}
      </Typography>
      <Typography as="span" variant="body" fontWeight={strong ? 800 : 600}>
        {value}
      </Typography>
    </Box>
  );
}

/**
 * The points calculator, opened from the Rewards block of `PricingSection` on
 * the product, service and menu-item forms.
 *
 * It answers the two questions an operator actually has - "how many points
 * should this earn?" and "what should it cost in points?" - from two they can
 * answer without arithmetic: what the item sells for, and how many times someone
 * should have to buy it before the next one is free.
 *
 *     award       = round(price × rate)
 *     pointsPrice = visits × award
 *
 * ⚠ **`rate` is `System.points_per_currency` and is deliberately read-only
 * here.** It is one number for the whole catalog - that is the entire reason it
 * is a System column rather than a box on this dialog - and letting an item form
 * nudge it would silently re-scale every *other* item's numbers relative to this
 * one, which is the drift the field exists to prevent. It is changed in one
 * place, under Rewards on the site-settings page.
 *
 * ⚠ **The rate does not decide what the program costs; `visits` does.** A
 * customer spends `visits × price` to earn one item worth `price`, so the tenant
 * gives back `1 / visits` of that spend whatever the rate is - the rate only
 * decides whether the numbers on the card read 12 or 1,200. The dialog says so,
 * because an operator who thinks generosity lives in the rate will double it and
 * hand out exactly as much as before.
 *
 * ⚠ **`pointsPrice` is `visits × award` exactly, never a separately rounded
 * figure.** The promise the dialog makes ("buy it ten times and the eleventh is
 * free") is only true if those two numbers divide, and rounding the total to
 * something prettier is how a customer ends up 40 points short at the counter.
 */
export function PointsCalculatorModal({
  price,
  costPrice,
  currency,
  onApply,
  onCancel,
}: Props) {
  const t = useTranslations("Admin");
  const locale = useLocale();
  const systemId = useSession()?.systemId ?? 0;

  const [priceInput, setPriceInput] = useState(() =>
    String(price ?? "").trim(),
  );
  const [visitsInput, setVisitsInput] = useState(String(DEFAULT_VISITS));

  // The catalog-wide earn rate. Fetched here rather than by the three item forms
  // that render this dialog's button: the modal only mounts when it is opened,
  // so a form nobody calculates on pays nothing, and a rate an operator changed
  // a minute ago is the one they see.
  const [rate, setRate] = useState<number | null>(null);
  // Seeded from `systemId` rather than set to `false` inside the effect's "no
  // tenant" branch: a synchronous setState in an effect body is what the repo's
  // react-hooks rules refuse, and `useSession()` is server-provided context, so
  // the id this reads is already its final value on the first render. With no
  // id there is nothing to fetch and the dialog says the rate is missing, which
  // is the truth - there is no tenant to have one.
  const [rateLoading, setRateLoading] = useState(() => systemId > 0);

  useEffect(() => {
    if (!systemId) return;
    let live = true;
    getSystem(systemId)
      .then((data) => {
        if (!live) return;
        const value = Number(data.points_per_currency);
        setRate(Number.isFinite(value) && value > 0 ? value : null);
      })
      .catch(() => {
        /* non-critical: the dialog says the rate is missing and refuses */
      })
      .finally(() => {
        if (live) setRateLoading(false);
      });
    return () => {
      live = false;
    };
  }, [systemId]);

  const money = useMemo(() => {
    return (amount: number) => {
      try {
        return new Intl.NumberFormat(locale, {
          style: "currency",
          currency,
        }).format(amount);
      } catch {
        return amount.toFixed(2);
      }
    };
  }, [locale, currency]);

  const points = useMemo(() => {
    return (value: number) => {
      try {
        return new Intl.NumberFormat(locale).format(value);
      } catch {
        return String(value);
      }
    };
  }, [locale]);

  const priceValue = Number(priceInput);
  const visits = Math.floor(Number(visitsInput));
  const costValue = Number(String(costPrice ?? "").trim());

  const hasPrice = Number.isFinite(priceValue) && priceValue > 0;
  const hasVisits = Number.isFinite(visits) && visits >= 1;
  const ready = hasPrice && hasVisits && rate !== null;

  // Points are whole numbers on the API (a PositiveIntegerField), and an item
  // that earns nothing at all is not what anyone reaching for a calculator
  // means - so the award floors at one point rather than rounding to zero on a
  // cheap item under a small rate.
  const award = ready ? Math.max(1, Math.round(priceValue * rate)) : 0;
  const pointsPrice = ready ? award * visits : 0;

  /** What the tenant hands back, as a share of what the customer spends. It is
   *  `1 / visits` and nothing else - see the note on the rate above. */
  const rewardPct = hasVisits ? 100 / visits : 0;
  const marginPct =
    hasPrice && Number.isFinite(costValue) && costValue > 0
      ? ((priceValue - costValue) / priceValue) * 100
      : null;
  const overMargin = marginPct !== null && rewardPct > marginPct;

  const pct = (value: number) => `${value.toFixed(1)}%`;

  return (
    <ConfirmationModal
      title={t("pointsCalcTitle")}
      text={t("pointsCalcText")}
      panelMaxWidth="560px"
      okLabel={t("pointsCalcApply")}
      cancelLabel={t("cancel")}
      okDisabled={!ready}
      okCallback={() =>
        onApply({ price: priceInput, pointsAward: award, pointsPrice })
      }
      cancelCallback={onCancel}
    >
      <Box flexDirection="column" gap="16px">
        {/* The two questions. Selling price first, because it is what everything
            below is worked out from - and it is editable here so an operator who
            opened the dialog on a blank form is not sent back up the page for
            it; the answer travels back with the points on OK. */}
        <Box
          display="grid"
          gap="12px"
          alignItems="start"
          styles={{
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          }}
        >
          <TextInput
            label={t("sellingPrice")}
            format="number"
            value={priceInput}
            onChange={setPriceInput}
            error={!hasPrice ? t("pointsCalcNoPrice") : undefined}
          />
          <TextInput
            label={t("pointsCalcVisits")}
            type="number"
            min={1}
            value={visitsInput}
            onChange={setVisitsInput}
            helperText={t("pointsCalcVisitsHint")}
          />
        </Box>

        {/* The rate, stated rather than asked for: it belongs to the catalog,
            not to this item. */}
        <Box
          flexDirection="column"
          gap="2px"
          paddingY={10}
          styles={{
            borderTop: `1px solid ${HAIRLINE}`,
            borderBottom: `1px solid ${HAIRLINE}`,
          }}
        >
          {rateLoading ? (
            <Box alignItems="center" gap="8px">
              <Spinner size={16} />
              <Typography as="span" variant="body" color={MUTED}>
                {t("loading")}
              </Typography>
            </Box>
          ) : rate === null ? (
            <Typography variant="body" color="var(--error, #dc2626)">
              {t("pointsCalcRateMissing")}
            </Typography>
          ) : (
            <>
              <ResultRow
                label={t("pointsCalcRate")}
                value={t("pointsCalcRateValue", {
                  points: points(rate),
                  amount: money(1),
                })}
              />
              <Typography variant="caption" color={MUTED}>
                {t("pointsCalcRateWhere")}
              </Typography>
            </>
          )}
        </Box>

        {/* What those answers come to. */}
        <Box flexDirection="column" gap="8px">
          <ResultRow
            label={t("pointsAward")}
            value={ready ? points(award) : "—"}
            strong
          />
          <ResultRow
            label={t("pointsCalcResultPrice")}
            value={ready ? points(pointsPrice) : "—"}
            strong
          />
          <ResultRow
            label={t("pointsCalcResultBack")}
            value={hasVisits ? pct(rewardPct) : "—"}
          />
          {marginPct !== null && (
            <ResultRow label={t("pointsCalcMargin")} value={pct(marginPct)} />
          )}
        </Box>

        {/* What it means, in a sentence - and the two things an operator gets
            wrong: that the rate is where generosity lives, and that a reward can
            quietly cost more than the item makes. */}
        <Box flexDirection="column" gap="6px">
          {ready && (
            <Typography variant="body">
              {t("pointsCalcSummary", { visits, next: visits + 1 })}
            </Typography>
          )}
          {overMargin && (
            <Typography variant="body" color="var(--error, #dc2626)">
              {t("pointsCalcMarginWarn", { margin: pct(marginPct) })}
            </Typography>
          )}
          <Typography variant="caption" color={MUTED}>
            {t("pointsCalcRateNote")}
          </Typography>
        </Box>
      </Box>
    </ConfirmationModal>
  );
}

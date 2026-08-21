"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Card } from "@repo/ui/core-elements/card";
import { Grid } from "@repo/ui/core-elements/grid";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import { Switch } from "@repo/ui/core-elements/switch";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Typography } from "@repo/ui/core-elements/typography";
import { BilingualNameFields } from "@/components/admin/bilingual-name-fields";
import {
  createRewardTier,
  deleteRewardTier,
  updateRewardTier,
} from "@/lib/admin-api";

/**
 * The rewards program: one global switch, and the ladder of tiers under it.
 *
 * **Everything here is saved by the page's own Save button** - the switch,
 * because `rewards_enabled` is an ordinary `System` key in the page's `values`,
 * and the tiers, because `/admin/system` runs `persistRewardTiers` below as part
 * of its submit. This section is pure and controlled, exactly like
 * `MenuIngredientsEditor` and `MenuSizesEditor`: it holds no requests of its own
 * and a tier row is created, updated or deleted only when the page saves.
 *
 * (Backup and Restore sit *outside* the form for the opposite reason - they have
 * nothing in `values` at all and own a request each.)
 *
 * Three rules worth knowing before changing anything here:
 *
 * - **The switch is the only gate.** With it off nothing anywhere earns, shows
 *   or spends a point, and the catalog keeps its `points_award` / `points_price`
 *   numbers untouched - so a tenant can pause the program for a season and
 *   resume it without re-entering anything.
 * - **What a tier *does* is its multiplier, and nothing else.** It is applied to
 *   what a purchase earns, once, server-side. It deliberately does not move what
 *   an item costs in points: that number is printed on every catalog card, and a
 *   per-tier discount would make the card wrong for everyone but one rung.
 * - ⚠ **A tier is reached and kept by the same number.** `threshold` is how many
 *   points a customer must have *earned* inside the trailing period to sit on
 *   the rung - so a customer who stops buying slides back down as their old
 *   earnings age out. There is no separate "maintain" figure that could disagree
 *   with the "reach" one.
 */

/**
 * One tier row as the CMS edits it. `id` is the API's, present once persisted;
 * `key` is a stable client id used only for React list identity - an index would
 * re-key every row below a deletion and hand one row's translate preview to
 * another.
 */
export interface RewardTierRow {
  key: string;
  id?: number;
  name: string;
  en_name: string;
  threshold: string;
  period_months: string;
  earn_multiplier: string;
  color: string;
}

let rowCounter = 0;
export function newRewardTierRow(): RewardTierRow {
  rowCounter += 1;
  return {
    key: `tier-${Date.now()}-${rowCounter}`,
    name: "",
    en_name: "",
    threshold: "0",
    period_months: "12",
    earn_multiplier: "100",
    color: "",
  };
}

export function toRewardTierRow(
  row: Record<string, unknown>,
  key?: string,
): RewardTierRow {
  rowCounter += 1;
  return {
    key: key ?? `tier-existing-${row.id}`,
    id: Number(row.id),
    name: String(row.name ?? ""),
    en_name: String(row.en_name ?? ""),
    threshold: String(row.threshold ?? 0),
    period_months: String(row.period_months ?? 12),
    earn_multiplier: String(row.earn_multiplier ?? 100),
    color: String(row.color ?? ""),
  };
}

function payloadFor(row: RewardTierRow) {
  return {
    name: row.name.trim(),
    en_name: row.en_name.trim(),
    // Numbers, not the strings the inputs hold: the API's own validators bound
    // the multiplier (100-500) and the period (1-60 months), and a string would
    // be coerced before those ever ran.
    threshold: Number(row.threshold) || 0,
    period_months: Number(row.period_months) || 12,
    earn_multiplier: Number(row.earn_multiplier) || 100,
    color: row.color.trim(),
  };
}

/**
 * Write the ladder: delete the rows the operator removed, then create or update
 * the rest. Called from `/admin/system`'s `handleSubmit`, the same shape
 * `persistMenuSizes` has and for the same reasons.
 *
 * ⚠ **The ids the API assigns are reconciled back into the returned rows.**
 * Without that a second Save re-POSTs a tier created by the first, and the API
 * refuses the duplicate threshold - which makes a working form look broken.
 *
 * A row with a blank name is kept in state but never sent: `name` is required on
 * the model, so an empty row the operator has not filled in yet must not become
 * a failed request every time they save something else on the page.
 *
 * `failed` reports that at least one row did not land, so the page can say so
 * instead of showing "Saved". Nothing is thrown: a tier the API refused (a
 * duplicate threshold, a multiplier out of bounds) must not take the System
 * fields' own save down with it.
 */
export async function persistRewardTiers(
  rows: RewardTierRow[],
  originalIds: number[],
): Promise<{ rows: RewardTierRow[]; ids: number[]; failed: boolean }> {
  let failed = false;

  const currentIds = rows
    .map((r) => r.id)
    .filter((n): n is number => typeof n === "number");
  for (const id of originalIds.filter((oid) => !currentIds.includes(oid))) {
    // Nothing points at a tier - a customer's rung is re-derived from the ledger
    // on every read, never stored on them - so removing one only moves where the
    // rungs are. Anyone sitting on it resolves to the next one down.
    await deleteRewardTier(id).catch(() => {
      failed = true;
    });
  }

  const reconciled: RewardTierRow[] = [];
  for (const row of rows) {
    if (!row.name.trim()) {
      reconciled.push(row);
      continue;
    }
    if (row.id === undefined) {
      const created = await createRewardTier(payloadFor(row)).catch(() => null);
      if (created) {
        reconciled.push(toRewardTierRow(created, row.key));
      } else {
        // No id, so the row is retried on the next save rather than lost.
        failed = true;
        reconciled.push(row);
      }
    } else {
      await updateRewardTier(row.id, payloadFor(row)).catch(() => {
        failed = true;
      });
      reconciled.push(row);
    }
  }

  return {
    rows: reconciled,
    ids: reconciled
      .map((r) => r.id)
      .filter((n): n is number => typeof n === "number"),
    failed,
  };
}

interface RewardsSectionProps {
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  tiers: RewardTierRow[];
  onTiersChange: (rows: RewardTierRow[]) => void;
  loading?: boolean;
}

export function RewardsSection({
  values,
  onChange,
  tiers,
  onTiersChange,
  loading = false,
}: RewardsSectionProps) {
  const t = useTranslations("Admin");
  const enabled = values.rewards_enabled === true;

  const edit = (key: string, patch: Partial<RewardTierRow>) =>
    onTiersChange(
      tiers.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );

  const remove = (key: string) =>
    onTiersChange(tiers.filter((row) => row.key !== key));

  return (
    <Box flexDirection="column" gap={16}>
      <Typography as="h3" variant="h4" fontWeight={700}>
        {t("rewardsTitle")}
      </Typography>
      <Typography variant="body" color="var(--muted-foreground, #6b7280)">
        {t("rewardsIntro")}
      </Typography>

      {/* The switch and "+ Add" share one row, the shape every editor in the
          CMS uses for "what this section is" plus "add another row" - see
          `MenuIngredientsEditor`'s header. The button is deliberately beside
          the switch rather than under the ladder: it is the section's action,
          and a tenant with a dozen tiers should not have to scroll past them
          to add the thirteenth. */}
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        gap={12}
      >
        <Box display="flex" alignItems="center" gap={10}>
          <Switch
            checked={enabled}
            onChange={(v) => onChange("rewards_enabled", v)}
          />
          <Typography
            as="span"
            variant="body"
            fontWeight={500}
            color="var(--foreground)"
          >
            {t("rewardsEnabled")}
          </Typography>
        </Box>
        <Button
          text={t("addShort")}
          aria-label={t("rewardsAddTier")}
          kind="primary"
          size="sm"
          type="button"
          onClick={() => onTiersChange([...tiers, newRewardTierRow()])}
        />
      </Box>

      {/* The catalog-wide earn rate, above the ladder because it is the number
          every item's points are worked out from - the tiers only multiply what
          those items already award.

          ⚠ **Nothing at checkout reads it.** A purchase earns whatever the
          item's own `points_award` says; this is what the calculator on each
          product, service and menu-item form derives that number *from*, so one
          tenant's whole catalog is priced off one rate and points earned on a
          taco are worth what points earned on a pizza are. Changing it here does
          not re-price a single existing item - those numbers are printed on
          cards customers have already seen - it changes what the calculator
          proposes for the next one. The hint says so, because an operator who
          expects a re-price and does not get one will type the rate in again. */}
      {/* One column of the form's own two-column field grid - the width Site
          Name and every other `FieldDef` gets - rather than a narrower fixed
          box: this reads as one more field on the page, and the hint beneath it
          is a sentence, which at 280px wrapped over four lines. `spacing={2}`
          is 16px, the same gutter `.af__grid` uses, so the half-column works out
          to the same `calc(50% - 8px)`; `xs: 12` collapses it at the same
          breakpoint the form's grid collapses at. */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextInput
            label={t("rewardsPointsPerCurrency")}
            type="number"
            min={0.01}
            step={0.01}
            value={String(values.points_per_currency ?? "")}
            onChange={(v) => onChange("points_per_currency", v)}
            helperText={t("rewardsPointsPerCurrencyHint")}
          />
        </Grid>
      </Grid>

      {/* The ladder is rendered whatever the switch says. Turning the program
          off is a pause, not a teardown - hiding the tiers would suggest they
          had been lost, and an operator setting one up will want to build the
          ladder before going live. */}
      {loading ? (
        <Typography variant="body">{t("loading")}</Typography>
      ) : (
        <Grid container spacing={1.5}>
          {tiers.map((row) => (
            <Grid key={row.key} size={{ xs: 12, sm: 6 }}>
              <Card
                gap="10px"
                height="100%"
                // The name pair's translate preview and the fields' own labels
                // sit on the card's edges, so its default clipping has to go -
                // the same override an ingredient card makes.
                styles={{ overflow: "visible" }}
              >
                {/* The name pair and delete share the card's first row, the
                    button pinned to its top-right corner (`flex-start`, level
                    with the field labels rather than with the inputs) so it sits
                    where an ingredient card's delete does whatever the pair
                    below it grows into - a translate preview opening under a
                    name would otherwise carry the button down the card. `type`
                    is set on it because this section is nested inside
                    /admin/system's AdminForm, and only "button" keeps it from
                    submitting the page. */}
                <Box display="flex" alignItems="flex-start" gap="8px">
                  <BilingualNameFields
                    esLabel={t("rewardsTierName")}
                    enLabel={t("rewardsTierNameEn")}
                    esValue={row.name}
                    enValue={row.en_name}
                    required
                    onChange={(patch) =>
                      edit(row.key, {
                        ...(patch.es !== undefined ? { name: patch.es } : {}),
                        ...(patch.en !== undefined
                          ? { en_name: patch.en }
                          : {}),
                      })
                    }
                  />
                  <IconButton
                    icon="/icons/delete-trash-icon.svg"
                    aria-label={t("delete")}
                    title={t("delete")}
                    kind="error"
                    size="sm"
                    type="button"
                    onClick={() => remove(row.key)}
                  />
                </Box>

                {/* The four numbers stay on one line at every width: a grid of
                    equal columns rather than fixed widths that wrap, since a
                    tier's threshold, period, multiplier and colour are read
                    across as one statement. `minmax(0, 1fr)` is what lets them
                    actually shrink - a text input's own intrinsic width would
                    otherwise hold the track open and overflow the card. */}
                <Box
                  display="grid"
                  gap={10}
                  alignItems="end"
                  width="100%"
                  styles={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}
                >
                  <TextInput
                    label={t("rewardsTierThreshold")}
                    type="number"
                    value={row.threshold}
                    onChange={(v) => edit(row.key, { threshold: v })}
                    minWidth={0}
                  />
                  <TextInput
                    label={t("rewardsTierPeriod")}
                    type="number"
                    value={row.period_months}
                    onChange={(v) => edit(row.key, { period_months: v })}
                    minWidth={0}
                  />
                  <TextInput
                    label={t("rewardsTierMultiplier")}
                    type="number"
                    value={row.earn_multiplier}
                    onChange={(v) => edit(row.key, { earn_multiplier: v })}
                    minWidth={0}
                  />
                  {/* `swatch`, not `type="color"`: blank is a real value here
                      - it is how a tier says "wear the tenant's accent" - and a
                      native colour input has no empty state, it shows black and
                      means it. The value stays free text, so clearing the box
                      is still how the accent is restored. */}
                  <TextInput
                    label={t("rewardsTierColor")}
                    swatch
                    swatchLabel={t("colorPick")}
                    value={row.color}
                    onChange={(v) => edit(row.key, { color: v })}
                    maxLength={32}
                    minWidth={0}
                  />
                </Box>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}

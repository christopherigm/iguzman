"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "@repo/auth/session-provider";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { Switch } from "@repo/ui/core-elements/switch";
import { Typography } from "@repo/ui/core-elements/typography";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { useLlmProxy } from "@repo/ui/use-llm";
import {
  AdminApiError,
  fetchStockImage,
  getSystem,
  searchStockImages,
  stockImageFields,
} from "@/lib/admin-api";
import { buildTranslateMessages } from "./field-assist";
import { awardFor, GiveBackFields, useGiveBack } from "./points-give-back";

const MUTED = "color-mix(in srgb, var(--foreground) 65%, transparent)";

export type BulkAction = "translate" | "image" | "rewards";

/**
 * What a CMS list lets an operator do to **every one of its rows at once**.
 *
 * A tenant fills a catalog in one language, with no photographs and no points,
 * and then has to open two hundred forms to finish it. These are the three
 * passes that finish it in one press each - and they are configured per list
 * rather than inferred, because a read serializer carries fields no write one
 * accepts (an event's `en_venue_name` is derived from its branch) and a bulk
 * pass that guessed would write into them.
 */
export interface BulkActionsConfig {
  /**
   * The base keys whose `en_`-prefixed counterpart is the other half of the
   * pair - `["name", "description"]` meaning `name`/`en_name` and
   * `description`/`en_description`. ⚠ Only list keys the record's **write**
   * serializer accepts.
   */
  translate?: readonly string[];
  /** The record has its own `image` a stock photo can fill (not a logo or a map). */
  image?: boolean;
  /** The record has `points_award` + `points_price`, and a `price` to work them out from. */
  rewards?: boolean;
  /** Persists one row. The list's own `updateX` from `lib/admin-api`. */
  update: (id: number, data: Record<string, unknown>) => Promise<unknown>;
  /** Re-reads the list once a run ends - the page's own `load`. */
  reload: () => void | Promise<void>;
}

interface RunSummary {
  changed: number;
  skipped: number;
  failed: number;
  stopped: boolean;
}

const text = (value: unknown) => String(value ?? "").trim();

/**
 * The bulk-action bar every catalog CMS list carries, between its header row
 * and its table.
 *
 * Each action is the same shape: confirm, then walk the rows **one at a time**,
 * writing each with the list's ordinary `PATCH`. Sequential on purpose - a
 * translate pass is one LLM call per field and a photo pass one bank search per
 * row, and firing two hundred of either at once is how a tenant's API key gets
 * rate-limited half way through a catalog. It also makes the count honest:
 * `2/32` is two rows *written*, not two requests in flight.
 *
 * ⚠ **A run is resumable rather than transactional.** Rows are written as they
 * are worked out, so a failure, a stop or a closed tab leaves the rows already
 * done saved and the rest untouched - and running the pass again picks up
 * exactly where it left off, since every action skips what is already filled in.
 * There is no undo; the confirmation says so.
 */
export function BulkActionsBar({
  config,
  items,
  disabled,
}: {
  config: BulkActionsConfig;
  items: Record<string, unknown>[];
  disabled?: boolean;
}) {
  const t = useTranslations("Admin");
  const tCommon = useTranslations("Common");
  const systemId = useSession()?.systemId ?? 0;

  // Low temperature: a translation is the one LLM job with a right answer, and
  // the same name run twice should not come back two different ways.
  const { generate, abort } = useLlmProxy({ temperature: 0.2 });

  const [pending, setPending] = useState<BulkAction | null>(null);
  /** "Replace what is already there" - off by default, so the ordinary run only
   *  fills blanks and an operator has to ask for the destructive one. */
  const [replace, setReplace] = useState(false);
  const [running, setRunning] = useState<BulkAction | null>(null);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  /** The one failure worth stopping for: a tenant with no stock-bank key
   *  configured, where every remaining row would fail the same way. */
  const [fatal, setFatal] = useState<string | null>(null);

  // The catalog-wide earn rate, for the rewards pass. Read when the dialog is
  // opened rather than on mount, so a list nobody calculates on pays nothing.
  const [rate, setRate] = useState<number | null>(null);
  const [rateLoading, setRateLoading] = useState(false);

  const giveBack = useGiveBack();

  // Set by the Stop button and read by the loop between rows. A ref rather than
  // state because the loop is a closure that would otherwise go on reading the
  // `false` it started with.
  const stopped = useRef(false);

  useEffect(() => {
    if (pending !== "rewards" || !systemId) return;
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
  }, [pending, systemId]);

  const openDialog = (action: BulkAction) => {
    setSummary(null);
    setFatal(null);
    setReplace(false);
    setPending(action);
    if (action === "rewards") setRateLoading(systemId > 0);
  };

  // ── The three passes ──────────────────────────────────────────────────────

  /** The missing half of every pair this list declared, translated from the
   *  half that is filled in.
   *
   *  ⚠ **With `replace` on the Spanish side is the source**, because that is
   *  what "the catalog was written in Spanish" means and there is no way to ask
   *  a filled pair which half is the original. A catalog authored in English
   *  still gets the right answer from the ordinary run, which reads whichever
   *  half is actually there. */
  const translateRow = async (row: Record<string, unknown>) => {
    const patch: Record<string, unknown> = {};
    for (const key of config.translate ?? []) {
      const enKey = `en_${key}`;
      const es = text(row[key]);
      const en = text(row[enKey]);
      if (!es && !en) continue;
      if (es && (!en || replace)) {
        patch[enKey] = (await generate(buildTranslateMessages(es, key))).trim();
      } else if (en && !es) {
        patch[key] = (await generate(buildTranslateMessages(en, enKey))).trim();
      }
    }
    return patch;
  };

  /** The first photo a free stock bank offers for the record's own name.
   *
   *  ⚠ **The photo and its credit are one write** - storing an image clears
   *  whatever attribution the row carried, so `stockImageFields` sends all three
   *  keys together (see CLAUDE.md → "Finding an image in the CMS"). */
  const imageRow = async (row: Record<string, unknown>) => {
    if (row.image && !replace) return {};
    const query = text(row.name) || text(row.en_name);
    if (!query) return {};
    const { results } = await searchStockImages({ query });
    const hit = results[0];
    if (!hit) return {};
    const file = await fetchStockImage({
      bank: hit.bank,
      bank_id: hit.bank_id,
    });
    return stockImageFields(file);
  };

  /** What one purchase earns, and what one costs in points, from the row's own
   *  price and the give-back the operator asked for.
   *
   *  ⚠ **`points_price` is `visits × award` exactly**, and the award it
   *  multiplies is the row's **existing** one wherever that is being kept: a
   *  points price worked out from a number the row does not carry is what leaves
   *  a customer 40 points short at the counter. */
  const rewardsRow = (row: Record<string, unknown>) => {
    if (rate === null) return {};
    const price = Number(text(row.price));
    if (!Number.isFinite(price) || price <= 0) return {};

    const keepAward = !replace && row.points_award != null;
    const keepPrice = !replace && row.points_price != null;
    if (keepAward && keepPrice) return {};

    const award = keepAward ? Number(row.points_award) : awardFor(price, rate);
    const patch: Record<string, unknown> = {};
    if (!keepAward) patch.points_award = award;
    if (!keepPrice) patch.points_price = award * giveBack.visits;
    return patch;
  };

  // ── The run ───────────────────────────────────────────────────────────────

  const run = async (action: BulkAction) => {
    stopped.current = false;
    setPending(null);
    setSummary(null);
    setFatal(null);
    setRunning(action);
    setTotal(items.length);
    setDone(0);

    let changed = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of items) {
      if (stopped.current) break;
      const id = Number(row.id);
      try {
        const patch =
          action === "translate"
            ? await translateRow(row)
            : action === "image"
              ? await imageRow(row)
              : rewardsRow(row);
        if (Object.keys(patch).length === 0) {
          skipped++;
        } else {
          await config.update(id, patch);
          changed++;
        }
      } catch (e) {
        // One row the bank could not deliver, or one call the model refused,
        // must not cost the operator the rest of the pass - the run says how
        // many at the end, and a second run picks the failures back up.
        failed++;
        // A missing bank key is the exception: nothing after this row would
        // succeed either, so the pass stops and says the one thing an operator
        // can act on, exactly as the single-record picker does.
        if (e instanceof AdminApiError && e.data?.code === "NO_IMAGE_BANK") {
          setFatal(t("imageSearchNoBank"));
          setDone((value) => value + 1);
          break;
        }
      }
      setDone((value) => value + 1);
    }

    const wasStopped = stopped.current;
    setRunning(null);
    setSummary({ changed, skipped, failed, stopped: wasStopped });
    if (changed > 0) await config.reload();
  };

  const stop = () => {
    stopped.current = true;
    abort();
  };

  // ── The bar ───────────────────────────────────────────────────────────────

  const busy = running !== null;
  const blocked = disabled || busy || items.length === 0;

  const dialogTitle =
    pending === "translate"
      ? t("bulkTranslateTitle")
      : pending === "image"
        ? t("bulkImageTitle")
        : t("bulkRewardsTitle");
  const dialogText =
    pending === "translate"
      ? t("bulkTranslateText")
      : pending === "image"
        ? t("bulkImageText")
        : t("bulkRewardsText");
  const rewardsBlocked =
    pending === "rewards" && (rateLoading || rate === null || !giveBack.ready);

  return (
    <Box flexDirection="column" gap={10} aria-busy={busy}>
      <Box display="flex" alignItems="center" gap={12} flexWrap="wrap">
        <Typography as="span" variant="caption" color={MUTED}>
          {t("bulkActions")}
        </Typography>
        {config.translate && config.translate.length > 0 && (
          <Button
            text={t("bulkTranslate")}
            size="sm"
            type="button"
            disabled={blocked}
            onClick={() => openDialog("translate")}
          />
        )}
        {config.image && (
          <Button
            text={t("bulkImage")}
            size="sm"
            type="button"
            disabled={blocked}
            onClick={() => openDialog("image")}
          />
        )}
        {config.rewards && (
          <Button
            text={t("bulkRewards")}
            size="sm"
            type="button"
            disabled={blocked}
            onClick={() => openDialog("rewards")}
          />
        )}
        {busy && (
          <Button
            text={t("bulkStop")}
            kind="error"
            size="sm"
            type="button"
            onClick={stop}
          />
        )}
      </Box>

      {/* The count sits above the bar and hard right, so the eye that is already
          following the bar's leading edge finds it without moving. */}
      {busy && (
        <Box flexDirection="column" gap={4}>
          <Typography
            as="span"
            variant="caption"
            color={MUTED}
            textAlign="right"
          >
            {`${done}/${total}`}
          </Typography>
          <ProgressBar
            value={total > 0 ? (done / total) * 100 : 0}
            label={t("bulkActions")}
          />
        </Box>
      )}

      {fatal && (
        <Typography variant="body" color="var(--error, #dc2626)">
          {fatal}
        </Typography>
      )}

      {summary && (
        <Typography variant="caption" color={MUTED}>
          {t("bulkSummary", {
            changed: summary.changed,
            skipped: summary.skipped,
            failed: summary.failed,
          })}
          {summary.stopped ? ` ${t("bulkStopped")}` : ""}
        </Typography>
      )}

      {pending && (
        <ConfirmationModal
          title={dialogTitle}
          text={dialogText}
          panelMaxWidth="560px"
          okLabel={t("bulkRun", { count: items.length })}
          cancelLabel={tCommon("cancel")}
          okDisabled={rewardsBlocked}
          okCallback={() => void run(pending)}
          cancelCallback={() => setPending(null)}
        >
          <Box flexDirection="column" gap="16px">
            {pending === "rewards" && (
              <>
                <GiveBackFields giveBack={giveBack} />
                {!rateLoading && rate === null && (
                  <Typography variant="body" color="var(--error, #dc2626)">
                    {t("pointsCalcRateMissing")}
                  </Typography>
                )}
              </>
            )}

            <Box display="flex" alignItems="center" gap={10}>
              <Switch
                checked={replace}
                onChange={setReplace}
                aria-label={t("bulkReplace")}
              />
              <Box flexDirection="column" gap={2}>
                <Typography as="span" variant="body">
                  {t("bulkReplace")}
                </Typography>
                <Typography variant="caption" color={MUTED}>
                  {t("bulkReplaceHint")}
                </Typography>
              </Box>
            </Box>

            <Typography
              variant="body"
              color={replace ? "var(--error, #dc2626)" : MUTED}
            >
              {replace ? t("bulkWarnReplace") : t("bulkWarnFill")}
            </Typography>
          </Box>
        </ConfirmationModal>
      )}
    </Box>
  );
}

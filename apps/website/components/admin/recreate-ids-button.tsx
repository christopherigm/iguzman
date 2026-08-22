"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "@repo/auth/session-provider";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { Typography } from "@repo/ui/core-elements/typography";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { recreateSlugs, type SlugModelKey } from "@/lib/admin-api";
import { useSitePrefix } from "@/app/[locale]/admin/site-prefix-provider";

/**
 * "Recreate IDs" - rebuild slugs from the tenant's `System.site_prefix`.
 *
 * A record's slug is derived **once**, when it is created, and never again - so
 * a renamed dish keeps a URL saying whatever it said the day it was added, and
 * a catalog seeded before the prefix existed is still namespaced under whatever
 * its seeding door used. This is the deliberate second step that fixes both.
 *
 * It appears in two places, on purpose:
 *
 * * **`/admin/system`, with no `models`** - rebuild every record on the site,
 *   beside the field that drives it. That is where an operator lands after
 *   changing the prefix, which is the moment the whole catalog is stale.
 * * **In each CMS list's bulk-action bar, scoped to that list** - configured as
 *   `recreate: ["product"]` and so on, for finishing one family without
 *   touching the rest. It sits with the other every-row passes rather than in
 *   the header row, because that is what it is: one press that rewrites every
 *   record in the list.
 *
 * ⚠ **There is no undo, and the dialog is the only thing that says so.** Every
 * rebuilt record gets a new public URL and the old one 404s: no redirect is
 * kept, deliberately (that would be a new model plus a lookup on every miss).
 * Never render this without its confirmation.
 *
 * The whole rebuild is **one request**. It runs in a single transaction on the
 * API side, where it can dodge the slugs other tenants hold - which a browser
 * cannot see - so there is no per-row progress to report and no half-finished
 * state to resume from. That is the opposite of the `BulkActionsBar` passes it
 * now sits in, which are one LLM or bank call per row and so are walked one at
 * a time - which is why this button keeps its own confirmation and progress
 * rather than joining their run loop.
 */
export function RecreateIdsButton({
  /** Scope the rebuild to these families; omitted means every one of them. */
  models,
  /** Re-reads the list once the rebuild lands - the page's own `load`. */
  reload,
  /** Disabled while the page it sits on is still loading or saving. */
  disabled,
  /** Matches the surrounding controls: `sm` inside the bulk-action bar, `md`
   *  standing on its own at /admin/system. */
  size = "md",
}: {
  models?: SlugModelKey[];
  reload?: () => void | Promise<void>;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const t = useTranslations("Admin");
  const tCommon = useTranslations("Common");
  const systemId = useSession()?.systemId ?? 0;
  const sitePrefix = useSitePrefix();

  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{
    changed: number;
    total: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setConfirming(false);
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await recreateSlugs(systemId, models);
      setResult({ changed: res.changed, total: res.total });
      await reload?.();
    } catch {
      setError(t("recreateIdsFailed"));
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <Box display="flex" alignItems="center" gap={8} flexWrap="wrap">
        <Button
          text={t("recreateIds")}
          kind="warning"
          size={size}
          // Warning, not error: it is a maintenance action an operator is meant
          // to reach for, not a delete. The dialog carries the red.
          onClick={() => setConfirming(true)}
          // No prefix means the System has not loaded (or has none), and a
          // rebuild would have nothing to namespace with - the API refuses it
          // anyway, so the button says so first.
          disabled={disabled || running || !systemId || !sitePrefix}
          isLoading={running}
        />
        {result && (
          <Typography variant="caption" color="var(--success)">
            {t("recreateIdsDone", {
              changed: result.changed,
              total: result.total,
            })}
          </Typography>
        )}
        {error && (
          <Typography variant="caption" color="var(--error)">
            {error}
          </Typography>
        )}
      </Box>

      {running && <ProgressBar />}

      {confirming && (
        <ConfirmationModal
          title={t("recreateIds")}
          // The scoped and the whole-site presses say different things, because
          // one of them is about to move every URL on the site.
          text={
            models
              ? t("recreateIdsConfirmScoped", { prefix: sitePrefix ?? "" })
              : t("recreateIdsConfirmAll", { prefix: sitePrefix ?? "" })
          }
          okLabel={t("recreateIds")}
          cancelLabel={tCommon("cancel")}
          okCallback={() => void run()}
          cancelCallback={() => setConfirming(false)}
        >
          <Typography variant="caption" color="var(--error)">
            {t("recreateIdsWarning")}
          </Typography>
        </ConfirmationModal>
      )}
    </>
  );
}

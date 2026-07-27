"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { Badge } from "@repo/ui/core-elements/badge";
import { Select } from "@repo/ui/core-elements/select";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { useSession } from "@repo/auth/session-provider";
import {
  getMediaMigrationStatus,
  runMediaMigrationBatch,
  type MediaMigrationEntry,
  type MediaMigrationStatus,
  type MigrationSource,
} from "@/lib/admin-api";

/** Running totals, accumulated across every batch of one run. */
interface Totals {
  copied: number;
  skipped: number;
  missing: number;
  failed: number;
  foreign: number;
  repathed: number;
  processed: number;
}

const ZERO: Totals = {
  copied: 0,
  skipped: 0,
  missing: 0,
  failed: 0,
  foreign: 0,
  repathed: 0,
  processed: 0,
};

/** How many problem rows to show. Enough to spot a pattern, not a wall of text. */
const MAX_PROBLEMS = 20;

/**
 * "Migrate media" in the System CMS - the one-off move of a site's stored files
 * onto the R2 bucket they now resolve to.
 *
 * **Django staff only.** `page.tsx` renders this section solely for
 * `session.isStaff`, and the API is `IsAdminUser` rather than `IsSystemAdmin`
 * like everything else on this page. It is not a customer control: it rewrites
 * where every file in the site is stored and repoints the database at it.
 *
 * Three things this has to get right:
 *
 * * **It runs in batches, and the loop lives here.** One request per batch, each
 *   resuming at the previous `next_offset`, because copying a full catalog in a
 *   single request runs past the ingress timeout - which the browser reports as
 *   a bare network failure with the migration in an unknown state. The progress
 *   bar is a real percentage as a result, unlike Backup's honest indeterminate
 *   one.
 * * **Dry run is the default action, not a hidden option.** The migration writes
 *   to the database (a legacy path is repointed to `t/<id>/…`), so the operator
 *   gets to see the plan and the file count before anything moves.
 * * **The source is a choice, because only the operator knows it.** `local` is
 *   the production flip off the hostPath volume; `platform` is a tenant that is
 *   already on the platform bucket and is moving to its own. The *destination*
 *   is never a choice - it follows the tenant's domain and the API decides it.
 */
export function MediaMigrationSection() {
  const t = useTranslations("Admin");
  const tCommon = useTranslations("Common");
  const systemId = useSession()?.systemId ?? 0;

  const [status, setStatus] = useState<MediaMigrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<MigrationSource>("local");

  const [running, setRunning] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [progress, setProgress] = useState(0);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [problems, setProblems] = useState<MediaMigrationEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Lets the loop below stop between batches when the component goes away, so a
  // navigation mid-migration does not keep firing requests into a dead page.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Promise chain rather than an awaited call in the effect body: this repo runs
  // the experimental react-hooks rules at zero tolerance and `set-state-in-effect`
  // rejects a synchronous call into anything that sets state. Same shape as the
  // System form and StorageSection above.
  useEffect(() => {
    if (!systemId) return;
    getMediaMigrationStatus(systemId)
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, [systemId]);

  const run = async (isDryRun: boolean) => {
    setRunning(true);
    setDryRun(isDryRun);
    setError(null);
    setProgress(0);
    setProblems([]);

    const acc: Totals = { ...ZERO };
    const found: MediaMigrationEntry[] = [];

    try {
      let offset = 0;
      let total = status?.total_files ?? 0;

      // `done` comes from the server rather than being computed here: it owns
      // the plan, and the file count can change under a long run (a customer
      // uploading while this works) without desynchronising the loop.
      for (;;) {
        if (!alive.current) return;
        const batch = await runMediaMigrationBatch(systemId, {
          source,
          offset,
          dryRun: isDryRun,
        });

        acc.copied += batch.counts.copied;
        acc.skipped += batch.counts.skipped;
        acc.missing += batch.counts.missing;
        acc.failed += batch.counts.failed;
        acc.foreign += batch.counts.foreign;
        acc.repathed += batch.repathed;
        acc.processed += batch.processed;

        for (const entry of batch.entries) {
          if (entry.status !== "copied" && entry.status !== "skipped")
            found.push(entry);
        }

        total = batch.total;
        offset = batch.next_offset;
        setProgress(total ? Math.round((offset / total) * 100) : 100);
        setTotals({ ...acc });
        setProblems(found.slice(0, MAX_PROBLEMS));

        if (batch.done) break;
        // A zero-length batch would loop forever; the server only returns one
        // when the plan is empty, but the guard costs nothing.
        if (batch.processed === 0) break;
      }

      setProgress(100);
      // Re-read the status so `pending_repath` reflects what just happened -
      // after a real run it should be 0, which is the operator's confirmation
      // that there is nothing left to move.
      if (!isDryRun) {
        const fresh = await getMediaMigrationStatus(systemId);
        if (alive.current) setStatus(fresh);
      }
    } catch {
      setError(t("mediaMigrationFailed"));
    } finally {
      if (alive.current) setRunning(false);
    }
  };

  if (loading || !status) return null;

  const blocked = !status.can_migrate;
  const isPlatform = status.destination === "platform";

  return (
    <Box flexDirection="column" gap={16} paddingTop={32}>
      <Box alignItems="center" gap={10} flexWrap="wrap">
        <Typography as="h2" variant="h4" margin={0}>
          {t("mediaMigrationSection")}
        </Typography>
        {/* Staff-only, and said out loud: this section is not part of the
            customer's CMS and an operator should know that at a glance. */}
        <Badge variant="subtle" size="sm">
          {t("staffOnly")}
        </Badge>
      </Box>

      <Typography variant="body" color="var(--muted-foreground, #6b7280)">
        {t("mediaMigrationDesc")}
      </Typography>

      <Box flexDirection="column" gap={4}>
        <Typography variant="body">
          {t("mediaMigrationDestination")}:{" "}
          <strong>
            {isPlatform
              ? t("mediaMigrationPlatformBucket")
              : t("mediaMigrationOwnBucket")}
          </strong>
          {status.destination_label ? ` (${status.destination_label})` : ""}
        </Typography>
        <Typography variant="body">
          {t("mediaMigrationFileCount", {
            total: status.total_files,
            pending: status.pending_repath,
          })}
        </Typography>
      </Box>

      {blocked && (
        <Typography variant="body" color="var(--error, #dc2626)">
          {status.blocked_reason === "platform_unconfigured"
            ? t("mediaMigrationNoPlatform")
            : t("mediaMigrationNoTenantBucket")}
        </Typography>
      )}

      <Box maxWidth={320}>
        <Select
          label={t("mediaMigrationSource")}
          value={source}
          onChange={(v) => setSource(v as MigrationSource)}
          disabled={running || blocked}
          options={[
            { value: "local", label: t("mediaMigrationSourceLocal") },
            { value: "platform", label: t("mediaMigrationSourcePlatform") },
          ]}
        />
      </Box>

      <Box flexWrap="wrap" gap={12} alignItems="center">
        {/* No `kind`: the neutral surface-2 button, so the read-only dry run
            reads as secondary to the one that actually moves files. */}
        <Button
          text={t("mediaMigrationDryRun")}
          size="lg"
          isLoading={running && dryRun}
          onClick={() => void run(true)}
          disabled={running || blocked}
        />
        <Button
          text={t("mediaMigrationRun")}
          size="lg"
          isLoading={running && !dryRun}
          onClick={() => setConfirming(true)}
          disabled={running || blocked}
        />
      </Box>

      {running && (
        <Box flexDirection="column" gap={6}>
          {/* `label` is the accessible name, not visible text - the count below
              is what the operator actually reads. */}
          <ProgressBar
            value={progress}
            label={t("mediaMigrationSection")}
            size={6}
          />
          <Typography variant="caption">
            {dryRun ? t("mediaMigrationDryRunning") : t("mediaMigrationRunning")}{" "}
            {totals
              ? t("mediaMigrationProgress", {
                  done: totals.processed,
                  total: status.total_files,
                })
              : ""}
          </Typography>
        </Box>
      )}

      {totals && !running && (
        <Box flexDirection="column" gap={4}>
          <Typography
            variant="body"
            color={
              totals.failed ? "var(--error, #dc2626)" : "var(--success, #16a34a)"
            }
          >
            {dryRun
              ? t("mediaMigrationDryResult", {
                  copied: totals.copied,
                  skipped: totals.skipped,
                })
              : t("mediaMigrationResult", {
                  copied: totals.copied,
                  repathed: totals.repathed,
                  skipped: totals.skipped,
                })}
          </Typography>
          {(totals.missing > 0 || totals.failed > 0 || totals.foreign > 0) && (
            <Typography variant="caption" color="var(--error, #dc2626)">
              {t("mediaMigrationProblems", {
                missing: totals.missing,
                failed: totals.failed,
                foreign: totals.foreign,
              })}
            </Typography>
          )}
          {problems.map((entry) => (
            <Typography
              key={`${entry.model}-${entry.field}-${entry.name}`}
              variant="caption"
              color="var(--muted-foreground, #6b7280)"
            >
              {entry.status} · {entry.name}
              {entry.detail ? ` — ${entry.detail}` : ""}
            </Typography>
          ))}
        </Box>
      )}

      {error && (
        <Typography variant="body" color="var(--error, #dc2626)">
          {error}
        </Typography>
      )}

      <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
        {t("mediaMigrationNote")}
      </Typography>

      {/* Confirmed rather than fired straight off the button: this is the only
          control in the CMS that rewrites stored file paths across the whole
          site, and the dry run beside it is the cheap way to be sure first. */}
      {confirming && (
        <ConfirmationModal
          title={t("mediaMigrationConfirmTitle")}
          text={t("mediaMigrationConfirmBody", {
            total: status.total_files,
            destination: status.destination_label || status.host,
          })}
          okCallback={() => {
            setConfirming(false);
            void run(false);
          }}
          cancelCallback={() => setConfirming(false)}
          okLabel={t("mediaMigrationRun")}
          cancelLabel={tCommon("cancel")}
        />
      )}
    </Box>
  );
}

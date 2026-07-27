"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Button } from "@repo/ui/core-elements/button";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import { Badge } from "@repo/ui/core-elements/badge";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { BackupSectionSwitches, SECTION_LABELS } from "./backup-sections";
import {
  BACKUP_SECTIONS,
  createBackup,
  deleteBackup,
  listBackups,
  type BackupSection,
  type SiteBackup,
} from "@/lib/admin-api";

/** A size the operator can judge at a glance; the API reports raw bytes. */
function formatBytes(bytes: number): string {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const exp = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / 1024 ** exp;
  return `${value >= 10 || exp === 0 ? Math.round(value) : value.toFixed(1)} ${units[exp]}`;
}

/**
 * The default label for a new backup: the current local date-time.
 *
 * Built from the local clock rather than `toISOString()`, which would render a
 * UTC timestamp - an operator in Mexico making a backup at 8pm would see
 * tomorrow's date on it.
 */
function defaultBackupName(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}`
  );
}

/**
 * "Download / backup" in the System CMS: pick what to include, name it, and get
 * a zip - which is also kept as a restore point so the tenant has a history to
 * download or restore from later.
 *
 * The progress bar is deliberately indeterminate. Building the archive is one
 * synchronous request that serialises the database and copies every media file,
 * and the server has no way to report a percentage back mid-request; an animated
 * bar says "working" honestly, where a fake percentage would not.
 */
export function BackupSection() {
  const t = useTranslations("Admin");
  const tCommon = useTranslations("Common");

  const [sections, setSections] = useState<BackupSection[]>([
    ...BACKUP_SECTIONS,
  ]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [backups, setBackups] = useState<SiteBackup[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<SiteBackup | null>(null);

  // A promise chain rather than an awaited call in the effect body: this repo
  // runs the experimental react-hooks rules at zero tolerance, and
  // `set-state-in-effect` rejects a synchronous call into anything that sets
  // state. Same shape the System form above uses to load its own values.
  useEffect(() => {
    listBackups()
      .then(setBackups)
      .catch(() => setBackups([]))
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const created = await createBackup(
        name.trim() || defaultBackupName(),
        sections,
      );
      setBackups((prev) => [created, ...prev]);
      setName("");
      setSuccess(t("backupCreated"));
    } catch {
      setError(t("backupFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (backup: SiteBackup) => {
    setConfirmDelete(null);
    try {
      await deleteBackup(backup.id);
      setBackups((prev) => prev.filter((b) => b.id !== backup.id));
    } catch {
      setError(t("backupDeleteFailed"));
    }
  };

  return (
    <Box flexDirection="column" gap={16} paddingTop={32}>
      <Typography as="h2" variant="h4" margin={0}>
        {t("backupSection")}
      </Typography>
      <Typography variant="body" color="var(--muted-foreground, #6b7280)">
        {t("backupSectionDesc")}
      </Typography>

      <BackupSectionSwitches
        value={sections}
        onChange={setSections}
        disabled={busy}
      />

      <Box flexWrap="wrap" alignItems="flex-end" gap={12}>
        <Box flexGrow={1} minWidth={220}>
          <TextInput
            label={t("backupName")}
            value={name}
            onChange={setName}
            placeholder={defaultBackupName()}
            helperText={t("backupNameHelp")}
          />
        </Box>
        <Button
          text={t("backupCreate")}
          size="lg"
          onClick={() => void handleCreate()}
          disabled={busy || sections.length === 0}
        />
      </Box>

      {busy && (
        <Box flexDirection="column" gap={6}>
          <ProgressBar label={t("backupWorking")} />
          <Typography
            variant="caption"
            color="var(--muted-foreground, #6b7280)"
          >
            {t("backupWorking")}
          </Typography>
        </Box>
      )}
      {error && (
        <Typography variant="body" color="var(--error, #dc2626)">
          {error}
        </Typography>
      )}
      {success && (
        <Typography variant="body" color="var(--success, #16a34a)">
          {success}
        </Typography>
      )}

      <Typography as="h3" variant="h5" marginTop={8} marginBottom={0}>
        {t("backupHistory")}
      </Typography>
      {loading ? (
        <Typography variant="body">{t("loading")}</Typography>
      ) : backups.length === 0 ? (
        <Typography variant="body" color="var(--muted-foreground, #6b7280)">
          {t("backupHistoryEmpty")}
        </Typography>
      ) : (
        <Box flexDirection="column" gap={10}>
          {backups.map((backup) => (
            <Card key={backup.id} padding={12}>
              <Box
                flexWrap="wrap"
                alignItems="center"
                justifyContent="space-between"
                gap={12}
              >
                <Box flexDirection="column" gap={6} flexGrow={1} minWidth={200}>
                  <Typography variant="body" fontWeight={600}>
                    {backup.name}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="var(--muted-foreground, #6b7280)"
                  >
                    {new Date(backup.created).toLocaleString()} ·{" "}
                    {formatBytes(backup.size_bytes)} ·{" "}
                    {t("backupRecordCount", { count: backup.total_records })} ·{" "}
                    {t("backupMediaCount", { count: backup.media_files })}
                  </Typography>
                  <Box flexWrap="wrap" gap={6}>
                    {backup.sections.map((section) => (
                      <Badge key={section} variant="subtle" size="sm">
                        {t(SECTION_LABELS[section])}
                      </Badge>
                    ))}
                  </Box>
                </Box>
                <Box alignItems="center" gap={4}>
                  {/* A plain anchor, not next/link: the target is a file
                      download, not a route - prefetching it would pull the whole
                      archive down in the background. */}
                  <a
                    href={`/api/backups/${backup.id}/download/`}
                    download
                    aria-label={t("backupDownload")}
                    title={t("backupDownload")}
                  >
                    <IconButton
                      icon="/icons/download.svg"
                      aria-label={t("backupDownload")}
                      kind="primary"
                    />
                  </a>
                  <IconButton
                    icon="/icons/delete.svg"
                    aria-label={t("backupDelete")}
                    title={t("backupDelete")}
                    kind="error"
                    onClick={() => setConfirmDelete(backup)}
                  />
                </Box>
              </Box>
            </Card>
          ))}
        </Box>
      )}

      {confirmDelete && (
        <ConfirmationModal
          title={t("backupDeleteTitle")}
          text={t("backupDeleteText", { name: confirmDelete.name })}
          okCallback={() => void handleDelete(confirmDelete)}
          cancelCallback={() => setConfirmDelete(null)}
          okLabel={tCommon("ok")}
          cancelLabel={tCommon("cancel")}
        />
      )}
    </Box>
  );
}

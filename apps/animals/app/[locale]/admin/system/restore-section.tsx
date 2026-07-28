'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { Card } from '@repo/ui/core-elements/card';
import { Typography } from '@repo/ui/core-elements/typography';
import { Button } from '@repo/ui/core-elements/button';
import { Switch } from '@repo/ui/core-elements/switch';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import { BackupSectionSwitches } from './backup-sections';
import {
  BACKUP_SECTIONS,
  AdminApiError,
  restoreBackup,
  type BackupSection,
  type RestoreResult,
} from '@/lib/admin-api';

/**
 * "Restore" on /admin/system: upload an archive produced by the Backup section
 * above and write it back over this site.
 *
 * Three things this deliberately does:
 *
 * - **Confirms before running.** A restore is the most destructive action the
 *   CMS offers, and in replace mode it deletes rows outright.
 * - **Reports what the server actually did**, per model, rather than a bare
 *   "done". A restore that skipped half its rows on a slug conflict looks
 *   identical to a clean one otherwise.
 * - **Surfaces the server's own message on a 400.** The failure an operator will
 *   actually hit - an archive that does not contain a section they ticked - is
 *   explained precisely by the API, and replacing that with a generic "restore
 *   failed" would leave them nothing to act on.
 */
export function RestoreSection() {
  const t = useTranslations('Admin');
  const tCommon = useTranslations('Common');

  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sections, setSections] = useState<BackupSection[]>([...BACKUP_SECTIONS]);
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RestoreResult | null>(null);
  const [confirming, setConfirming] = useState(false);

  const handleRestore = async () => {
    setConfirming(false);
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await restoreBackup({ file, sections, mode: replace ? 'replace' : 'merge' }));
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
    } catch (err) {
      const detail =
        err instanceof AdminApiError && typeof err.data.detail === 'string'
          ? err.data.detail
          : null;
      setError(detail ?? t('restoreFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box flexDirection="column" gap={16} paddingTop={32}>
      <Typography as="h2" variant="h4" margin={0}>
        {t('restoreSection')}
      </Typography>
      <Typography variant="body" color="var(--muted-foreground, #6b7280)">
        {t('restoreSectionDesc')}
      </Typography>

      <Box flexWrap="wrap" alignItems="center" gap={12}>
        {/* Hidden because a native file input cannot be styled to match the rest
            of the CMS; the Button below is its label. `aria-hidden` is this
            repo's convention for a programmatically-triggered input. */}
        <input
          ref={fileInput}
          type="file"
          accept=".zip,application/zip"
          aria-hidden="true"
          style={{ display: 'none' }}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
            setError(null);
          }}
        />
        <Button
          text={t('restoreChooseFile')}
          size="lg"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
        />
        <Typography variant="body" color={file ? undefined : 'var(--muted-foreground, #6b7280)'}>
          {file ? file.name : t('restoreNoFile')}
        </Typography>
      </Box>

      <BackupSectionSwitches value={sections} onChange={setSections} disabled={busy} />

      <Card padding={12} gap={8}>
        <Box alignItems="center" gap={8}>
          <Switch
            checked={replace}
            disabled={busy}
            onChange={setReplace}
            aria-label={t('restoreModeReplace')}
          />
          <Typography variant="body" fontWeight={600}>
            {t('restoreModeReplace')}
          </Typography>
        </Box>
        <Typography variant="body" color="var(--muted-foreground, #6b7280)">
          {replace ? t('restoreModeReplaceHelp') : t('restoreModeMergeHelp')}
        </Typography>
      </Card>

      <Box>
        <Button
          text={t('restoreRun')}
          size="lg"
          onClick={() => setConfirming(true)}
          disabled={busy || !file || sections.length === 0}
        />
      </Box>

      {busy && (
        <Box flexDirection="column" gap={6}>
          <ProgressBar label={t('restoreWorking')} />
          <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
            {t('restoreWorking')}
          </Typography>
        </Box>
      )}
      {error && (
        <Typography variant="body" color="var(--error, #dc2626)">
          {error}
        </Typography>
      )}

      {result && (
        <Card padding={12} gap={8}>
          <Typography variant="body" fontWeight={600} color="var(--success, #16a34a)">
            {t('restoreDone')}
          </Typography>
          {Object.entries(result.results).map(([model, counts]) => (
            <Typography key={model} variant="caption">
              {model}: {t('restoreCounts', counts)}
            </Typography>
          ))}
        </Card>
      )}

      {confirming && (
        <ConfirmationModal
          title={t('restoreConfirmTitle')}
          text={replace ? t('restoreConfirmReplace') : t('restoreConfirmMerge')}
          okCallback={() => void handleRestore()}
          cancelCallback={() => setConfirming(false)}
          okLabel={tCommon('ok')}
          cancelLabel={tCommon('cancel')}
        />
      )}
    </Box>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Button } from "@repo/ui/core-elements/button";
import { Switch } from "@repo/ui/core-elements/switch";
import { Badge } from "@repo/ui/core-elements/badge";
import { useSession } from "@repo/auth/session-provider";
import {
  getStorageConfig,
  testStorageConnection,
  updateSystem,
  type StorageConfig,
} from "@/lib/admin-api";

/** The form's own shape: the config, plus the secret the API never sends back. */
interface StorageForm {
  storage_enabled: boolean;
  storage_account_id: string;
  storage_access_key_id: string;
  storage_secret_access_key: string;
  storage_bucket_name: string;
  storage_public_domain: string;
}

const EMPTY: StorageForm = {
  storage_enabled: false,
  storage_account_id: "",
  storage_access_key_id: "",
  storage_secret_access_key: "",
  storage_bucket_name: "",
  storage_public_domain: "",
};

/**
 * "Storage" in the System CMS: connect this site's own Cloudflare R2 bucket.
 *
 * Only worth filling in for a site on its own domain. Left alone - the normal
 * case - the site's images and backups live in the platform's bucket and are
 * served from its CDN, which needs no configuration from the customer at all.
 * Filled in, this site's uploads go to *its* account and serve from *its*
 * hostname, so the customer owns their assets and their bandwidth bill.
 *
 * Three things this section has to get right, all for the same reason - that a
 * wrong value here is not visible until an image silently fails to appear:
 *
 * * **A blank secret means "leave unchanged", so it is deleted from the payload
 *   rather than sent as `""`.** The API has no read path for the key, so this
 *   field always loads blank; submitting it verbatim would wipe a working
 *   bucket the first time anyone toggled the switch. Same rule as the Stripe
 *   secrets on `/admin/payments`.
 * * **"Test connection" round-trips the values in the form**, not the saved
 *   ones, so a typo is caught before it becomes the destination for uploads.
 * * **Turning this on does not move files that already exist.** They keep
 *   serving from the platform bucket, and an operator runs
 *   `sync_media_to_r2 --system <host> --source platform` to copy them across.
 *   The section says so rather than leaving it to be discovered.
 *
 * Sits outside the page's `AdminForm` (like Backup and Restore) because it owns
 * its own request and its own buttons.
 */
export function StorageSection() {
  const t = useTranslations("Admin");
  const systemId = useSession()?.systemId ?? 0;

  const [values, setValues] = useState<StorageForm>(EMPTY);
  const [configured, setConfigured] = useState(false);
  const [secretSet, setSecretSet] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    detail: string;
  } | null>(null);

  const applyConfig = (data: StorageConfig) => {
    setValues({
      storage_enabled: data.storage_enabled,
      storage_account_id: data.storage_account_id ?? "",
      storage_access_key_id: data.storage_access_key_id ?? "",
      // Never populated from the server - there is nothing to populate it with.
      storage_secret_access_key: "",
      storage_bucket_name: data.storage_bucket_name ?? "",
      storage_public_domain: data.storage_public_domain ?? "",
    });
    setConfigured(data.storage_configured);
    setSecretSet(data.storage_secret_set);
  };

  // Promise chain rather than an awaited call in the effect body: this repo runs
  // the experimental react-hooks rules at zero tolerance and `set-state-in-effect`
  // rejects a synchronous call into anything that sets state. Same shape as the
  // System form and BackupSection above.
  useEffect(() => {
    if (!systemId) return;
    getStorageConfig(systemId)
      .then(applyConfig)
      .catch(() => setError(t("errorLoad")))
      .finally(() => setLoading(false));
  }, [systemId, t]);

  const set = <K extends keyof StorageForm>(key: K, value: StorageForm[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    // Any edit invalidates the previous verdict - a green "connected" beside a
    // field the operator has since changed is worse than no verdict at all.
    setTestResult(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testStorageConnection(systemId, {
        storage_account_id: values.storage_account_id.trim(),
        storage_access_key_id: values.storage_access_key_id.trim(),
        // Omitted when blank, so the API falls back to the stored secret.
        ...(values.storage_secret_access_key
          ? { storage_secret_access_key: values.storage_secret_access_key }
          : {}),
        storage_bucket_name: values.storage_bucket_name.trim(),
        storage_public_domain: values.storage_public_domain.trim(),
      });
      setTestResult(result);
    } catch {
      setTestResult({ ok: false, detail: t("storageTestFailed") });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Record<string, unknown> = {
        storage_enabled: values.storage_enabled,
        storage_account_id: values.storage_account_id.trim(),
        storage_access_key_id: values.storage_access_key_id.trim(),
        storage_bucket_name: values.storage_bucket_name.trim(),
        storage_public_domain: values.storage_public_domain.trim(),
      };
      // A blank secret is "keep the current one", never "clear it": the field
      // always loads blank, so sending "" would wipe a working bucket.
      if (values.storage_secret_access_key)
        payload.storage_secret_access_key = values.storage_secret_access_key;

      await updateSystem(systemId, payload);
      const fresh = await getStorageConfig(systemId);
      applyConfig(fresh);
      setSuccess(t("saved"));
    } catch {
      setError(t("errorSave"));
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <Box flexDirection="column" gap={16} paddingTop={32}>
        <Typography as="h2" variant="h4" margin={0}>
          {t("storageSection")}
        </Typography>
        <Typography variant="body">{t("loading")}</Typography>
      </Box>
    );

  const busy = saving || testing;

  return (
    <Box flexDirection="column" gap={16} paddingTop={32}>
      <Box alignItems="center" gap={10} flexWrap="wrap">
        <Typography as="h2" variant="h4" margin={0}>
          {t("storageSection")}
        </Typography>
        <Badge variant={configured ? "filled" : "subtle"} size="sm">
          {configured ? t("storageOwnBucket") : t("storagePlatformBucket")}
        </Badge>
      </Box>
      <Typography variant="body" color="var(--muted-foreground, #6b7280)">
        {t("storageSectionDesc")}
      </Typography>

      <Box alignItems="center" gap={10}>
        <Switch
          checked={values.storage_enabled}
          onChange={(next) => set("storage_enabled", next)}
          disabled={busy}
          aria-label={t("storageEnabled")}
        />
        <Typography variant="body">{t("storageEnabled")}</Typography>
      </Box>

      <Box flexWrap="wrap" gap={12}>
        <Box flexGrow={1} minWidth={240}>
          <TextInput
            label={t("storageAccountId")}
            value={values.storage_account_id}
            onChange={(v) => set("storage_account_id", v)}
            helperText={t("storageAccountIdHelp")}
            disabled={busy}
          />
        </Box>
        <Box flexGrow={1} minWidth={240}>
          <TextInput
            label={t("storageBucketName")}
            value={values.storage_bucket_name}
            onChange={(v) => set("storage_bucket_name", v)}
            helperText={t("storageBucketNameHelp")}
            disabled={busy}
          />
        </Box>
      </Box>

      <Box flexWrap="wrap" gap={12}>
        <Box flexGrow={1} minWidth={240}>
          <TextInput
            label={t("storageAccessKeyId")}
            value={values.storage_access_key_id}
            onChange={(v) => set("storage_access_key_id", v)}
            disabled={busy}
          />
        </Box>
        <Box flexGrow={1} minWidth={240}>
          <TextInput
            label={t("storageSecretAccessKey")}
            type="password"
            value={values.storage_secret_access_key}
            onChange={(v) => set("storage_secret_access_key", v)}
            placeholder={secretSet ? "••••••••" : undefined}
            helperText={
              secretSet ? t("storageSecretKeep") : t("storageSecretHelp")
            }
            disabled={busy}
          />
        </Box>
      </Box>

      <TextInput
        label={t("storagePublicDomain")}
        value={values.storage_public_domain}
        onChange={(v) => set("storage_public_domain", v)}
        helperText={t("storagePublicDomainHelp")}
        disabled={busy}
      />

      <Box flexWrap="wrap" gap={12} alignItems="center">
        {/* No `kind`: a neutral surface-2 button, so "Test" reads as secondary
            to the primary Save beside it. */}
        <Button
          text={t("storageTest")}
          size="lg"
          isLoading={testing}
          onClick={() => void handleTest()}
          disabled={busy}
        />
        <Button
          text={t("save")}
          size="lg"
          onClick={() => void handleSave()}
          disabled={busy}
        />
      </Box>

      {testing && <Typography variant="body">{t("storageTesting")}</Typography>}
      {testResult && (
        <Typography
          variant="body"
          color={
            testResult.ok ? "var(--success, #16a34a)" : "var(--error, #dc2626)"
          }
        >
          {testResult.detail}
        </Typography>
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

      {/* Said here rather than left to be discovered: switching the bucket does
          not carry the existing files with it, and an operator who assumes it
          does will see a site full of broken images and no error anywhere. */}
      <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
        {t("storageMigrationNote")}
      </Typography>
    </Box>
  );
}

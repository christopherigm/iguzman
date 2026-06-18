"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { Select } from "@repo/ui/core-elements/select";
import { Badge } from "@repo/ui/core-elements/badge";
import {
  getJobCredentials,
  createJobCredential,
  deleteJobCredential,
  type JobApiCredential,
  type JobProvider,
} from "@/lib/jobs";
import Card from "@repo/ui/core-elements/card";

// JSearch leads: it is the primary provider (full job descriptions); Adzuna is the
// breadth fallback. Order mirrors the backend's PROVIDER_PRIORITY.
const PROVIDERS: JobProvider[] = ["jsearch", "adzuna"];

// Where users obtain credentials for each provider.
const PROVIDER_DOCS: Record<JobProvider, string> = {
  adzuna: "https://developer.adzuna.com/",
  jsearch: "https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch",
};

/**
 * JobApiKeysSection - BYOK provider credentials card. Lets the user store and
 * remove per-provider API keys used to bill job fetches against their own quota.
 */
export function JobApiKeysSection() {
  const t = useTranslations("ProfilePage");

  const [keysLoading, setKeysLoading] = useState(true);
  const [credentials, setCredentials] = useState<JobApiCredential[]>([]);
  const [provider, setProvider] = useState<JobProvider>("jsearch");
  const [appId, setAppId] = useState("");
  const [keyValue, setKeyValue] = useState("");
  const [keyLabel, setKeyLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    getJobCredentials()
      .then((creds) => setCredentials(creds))
      .catch(() => setError(t("jobKeysSaveError")))
      .finally(() => setKeysLoading(false));
  }, [t]);

  const handleAdd = useCallback(async () => {
    const secret = keyValue.trim();
    // Adzuna stores the credential as the "app_id:app_key" pair (split here for UX only).
    const key = provider === "adzuna" ? `${appId.trim()}:${secret}` : secret;
    if (!secret || (provider === "adzuna" && !appId.trim())) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createJobCredential({
        provider,
        key,
        label: keyLabel.trim(),
      });
      setCredentials((prev) => [
        ...prev.filter((c) => c.provider !== provider),
        created,
      ]);
      setAppId("");
      setKeyValue("");
      setKeyLabel("");
    } catch {
      setError(t("jobKeysSaveError"));
    } finally {
      setSaving(false);
    }
  }, [keyValue, provider, appId, keyLabel, t]);

  const handleDelete = useCallback(
    async (id: number) => {
      setDeletingId(id);
      setError(null);
      try {
        await deleteJobCredential(id);
        setCredentials((prev) => prev.filter((c) => c.id !== id));
      } catch {
        setError(t("jobKeysDeleteError"));
      } finally {
        setDeletingId(null);
      }
    },
    [t],
  );

  return (
    <Card flexDirection="column" gap={20}>
      <Box display="flex" flexDirection="column" gap={4}>
        <Typography as="h2" variant="h3" fontWeight={600}>
          {t("jobSearchApiTitle")}
        </Typography>
        <Typography variant="body" color="var(--muted-foreground, #6b7280)">
          {t("jobKeysSubtitle")}
        </Typography>
      </Box>

      {keysLoading ? (
        <ProgressBar label={t("loading")} />
      ) : (
        <>
          {credentials.length > 0 && (
            <Box display="flex" flexDirection="column" gap={8}>
              {credentials.map((cred) => (
                <Box
                  key={cred.id}
                  display="flex"
                  flexDirection="column"
                  gap={8}
                  padding={10}
                  borderRadius={8}
                  styles={{
                    border: "1px solid var(--border, #e5e7eb)",
                    background: "var(--surface-2)",
                  }}
                >
                  <Box display="flex" alignItems="center" gap={8}>
                    <Badge
                      variant="subtle"
                      color="#06b6d4"
                      style={{ textTransform: "uppercase" }}
                    >
                      {t(`jobKeysProviders.${cred.provider}`)}
                    </Badge>
                    <Typography variant="body" styles={{ flex: 1 }}>
                      {cred.label || t("jobKeysNoLabel")}
                    </Typography>
                    <Typography
                      variant="body"
                      color="var(--muted-foreground, #6b7280)"
                    >
                      {t("jobKeysStored")}
                    </Typography>
                    <Button
                      unstyled
                      type="button"
                      className="profile__upload-another"
                      disabled={deletingId === cred.id}
                      aria-label={`${t("jobKeysDelete")} ${cred.provider}`}
                      onClick={() => void handleDelete(cred.id)}
                    >
                      {deletingId === cred.id ? "…" : t("jobKeysDelete")}
                    </Button>
                  </Box>
                  <Box display="flex" flexDirection="column" gap={4}>
                    <Box
                      display="flex"
                      justifyContent="space-between"
                      alignItems="baseline"
                      gap={8}
                    >
                      <Typography
                        variant="body"
                        color="var(--muted-foreground, #6b7280)"
                      >
                        {t("jobKeysUsageLabel")}
                      </Typography>
                      <Typography
                        variant="body"
                        color="var(--muted-foreground, #6b7280)"
                      >
                        {t("jobKeysUsageCount", {
                          used: cred.calls_used_today,
                          limit: cred.call_limit,
                        })}
                      </Typography>
                    </Box>
                    <ProgressBar
                      value={
                        cred.call_limit > 0
                          ? (cred.calls_used_today / cred.call_limit) * 100
                          : 0
                      }
                      label={t("jobKeysUsageLabel")}
                    />
                  </Box>
                </Box>
              ))}
            </Box>
          )}

          <Box display="flex" flexDirection="column" gap={12} marginTop={8}>
            <Box display="flex" flexDirection="column" gap={4}>
              <Select
                label={t("jobKeysProviderLabel")}
                value={provider}
                onChange={(v) => {
                  setProvider(v as JobProvider);
                  setError(null);
                }}
                options={PROVIDERS.map((p) => ({
                  value: p,
                  label: t(`jobKeysProviders.${p}`),
                }))}
              />
              <Typography
                variant="body"
                color="var(--muted-foreground, #6b7280)"
              >
                {t("jobKeysGetKeyText")}{" "}
                <a
                  href={PROVIDER_DOCS[provider]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="profile__review-link"
                >
                  {t("jobKeysGetKeyLink", {
                    provider: t(`jobKeysProviders.${provider}`),
                  })}
                </a>
              </Typography>
            </Box>
            {provider === "adzuna" && (
              <TextInput
                label={t("jobKeysAppIdLabel")}
                type="text"
                value={appId}
                onChange={(v) => {
                  setAppId(v);
                  setError(null);
                }}
                placeholder={t("jobKeysAppIdPlaceholder")}
                aria-label={t("jobKeysAppIdLabel")}
                autoComplete="off"
              />
            )}
            <TextInput
              label={
                provider === "adzuna"
                  ? t("jobKeysAppKeyLabel")
                  : t("jobKeysKeyLabel")
              }
              type="password"
              value={keyValue}
              onChange={(v) => {
                setKeyValue(v);
                setError(null);
              }}
              placeholder={t(`jobKeysKeyPlaceholder.${provider}`)}
              aria-label={
                provider === "adzuna"
                  ? t("jobKeysAppKeyLabel")
                  : t("jobKeysKeyLabel")
              }
              autoComplete="off"
            />
            <TextInput
              label={t("jobKeysLabelLabel")}
              type="text"
              value={keyLabel}
              onChange={setKeyLabel}
              placeholder={t("jobKeysLabelPlaceholder")}
              aria-label={t("jobKeysLabelLabel")}
            />
          </Box>

          {error && (
            <Typography
              variant="body"
              role="alert"
              color="var(--error, #ef4444)"
            >
              {error}
            </Typography>
          )}

          <Box display="flex" justifyContent="flex-end" marginTop={8}>
            <Button
              text={saving ? t("jobKeysSaving") : t("jobKeysSave")}
              type="button"
              size="lg"
              kind="primary"
              disabled={
                saving ||
                !keyValue.trim() ||
                (provider === "adzuna" && !appId.trim())
              }
              onClick={() => void handleAdd()}
              icon="/icons/download.svg"
              iconPosition="end"
            />
          </Box>
        </>
      )}
    </Card>
  );
}

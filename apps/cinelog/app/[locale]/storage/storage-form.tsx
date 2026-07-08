"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@repo/i18n/navigation";
import { Container } from "@repo/ui/core-elements/container";
import { Box } from "@repo/ui/core-elements/box";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { ApiError } from "@/lib/auth";
import {
  createBucket,
  deleteBucket,
  listBuckets,
  type S3Bucket,
  type S3BucketInput,
} from "@/lib/storage";
import "./storage-form.css";

const MUTED = "var(--muted-foreground, #6b7280)";

function SuccessMessage({ message }: { message: string }) {
  return (
    <Box
      paddingX={12}
      paddingY={8}
      borderRadius={6}
      backgroundColor="var(--success-bg, rgba(34,197,94,0.08))"
    >
      <Typography variant="caption" color="var(--success, #22c55e)">
        {message}
      </Typography>
    </Box>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <Box
      paddingX={12}
      paddingY={8}
      borderRadius={6}
      backgroundColor="var(--error-bg, rgba(239,68,68,0.08))"
    >
      <Typography variant="caption" role="alert" color="var(--error, #ef4444)">
        {message}
      </Typography>
    </Box>
  );
}

const EMPTY_FORM: S3BucketInput = {
  label: "",
  endpoint_url: "",
  region: "",
  bucket_name: "",
  access_key_id: "",
  secret_access_key: "",
};

/** The add-a-bucket form. Calls back on a successful create so the list refreshes. */
function AddBucketForm({ onCreated }: { onCreated: (bucket: S3Bucket) => void }) {
  const t = useTranslations("StoragePage");
  const [form, setForm] = useState<S3BucketInput>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (patch: Partial<S3BucketInput>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const complete =
    form.label.trim() !== "" &&
    form.endpoint_url.trim() !== "" &&
    form.bucket_name.trim() !== "" &&
    form.access_key_id.trim() !== "" &&
    (form.secret_access_key ?? "").trim() !== "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const bucket = await createBucket({
        label: form.label.trim(),
        endpoint_url: form.endpoint_url.trim(),
        region: form.region?.trim() ?? "",
        bucket_name: form.bucket_name.trim(),
        access_key_id: form.access_key_id.trim(),
        secret_access_key: form.secret_access_key,
      });
      onCreated(bucket);
      setForm(EMPTY_FORM);
    } catch {
      setError(t("saveError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box
      width="100%"
      padding={10}
      borderRadius={12}
      flexDirection="column"
      gap={16}
      elevation={5}
      backgroundColor="var(--surface-1)"
    >
      <Typography as="h2" variant="h3" fontWeight={600}>
        {t("addTitle")}
      </Typography>
      <form onSubmit={handleSubmit} className="storage__form">
        <TextInput
          label={t("labelLabel")}
          value={form.label}
          onChange={(label) => patch({ label })}
          placeholder={t("labelPlaceholder")}
          autoComplete="off"
          disabled={loading}
        />
        <TextInput
          label={t("endpointLabel")}
          type="url"
          value={form.endpoint_url}
          onChange={(endpoint_url) => patch({ endpoint_url })}
          placeholder={t("endpointPlaceholder")}
          autoComplete="off"
          disabled={loading}
        />
        <Box display="flex" gap={12} flexWrap="wrap">
          <TextInput
            label={t("bucketLabel")}
            value={form.bucket_name}
            onChange={(bucket_name) => patch({ bucket_name })}
            flex="2 1 200px"
            autoComplete="off"
            disabled={loading}
          />
          <TextInput
            label={t("regionLabel")}
            value={form.region ?? ""}
            onChange={(region) => patch({ region })}
            placeholder={t("regionPlaceholder")}
            flex="1 1 120px"
            autoComplete="off"
            disabled={loading}
          />
        </Box>
        <TextInput
          label={t("accessKeyLabel")}
          value={form.access_key_id}
          onChange={(access_key_id) => patch({ access_key_id })}
          autoComplete="off"
          disabled={loading}
        />
        <TextInput
          label={t("secretKeyLabel")}
          type="password"
          value={form.secret_access_key ?? ""}
          onChange={(secret_access_key) => patch({ secret_access_key })}
          autoComplete="off"
          disabled={loading}
        />
        {error && <ErrorMessage message={error} />}
        {loading && <ProgressBar label={t("saving")} />}
        <Button
          text={loading ? t("saving") : t("addSubmit")}
          type="submit"
          size="md"
          width="100%"
          marginTop={4}
          kind="primary"
          disabled={loading || !complete}
        />
      </form>
    </Box>
  );
}

/** A single registered bucket, with a delete control. */
function BucketRow({
  bucket,
  onDelete,
}: {
  bucket: S3Bucket;
  onDelete: (id: number) => void;
}) {
  const t = useTranslations("StoragePage");
  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      gap={12}
      paddingX={12}
      paddingY={10}
      borderRadius={8}
      border="1px solid var(--border, #e5e7eb)"
    >
      <Box flexDirection="column" gap={2} styles={{ minWidth: 0 }}>
        <Typography variant="caption" fontWeight={600}>
          {bucket.label}
        </Typography>
        <Typography variant="caption" color={MUTED}>
          {bucket.bucket_name} · {bucket.endpoint_url}
        </Typography>
      </Box>
      <Button
        text={t("delete")}
        type="button"
        size="sm"
        kind="error"
        onClick={() => onDelete(bucket.id)}
      />
    </Box>
  );
}

export function StorageForm() {
  const t = useTranslations("StoragePage");
  const router = useRouter();
  const [buckets, setBuckets] = useState<S3Bucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; isError: boolean } | null>(
    null,
  );

  useEffect(() => {
    listBuckets()
      .then(setBuckets)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) router.push("/auth");
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function handleDelete() {
    if (confirmDeleteId === null) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    try {
      await deleteBucket(id);
      setBuckets((prev) => prev.filter((b) => b.id !== id));
      setToast({ message: t("deleted"), isError: false });
    } catch {
      setToast({ message: t("deleteError"), isError: true });
    }
  }

  return (
    <Container
      display="flex"
      alignItems="center"
      styles={{
        minHeight: "100vh",
        flexDirection: "column",
        justifyContent: "flex-start",
        paddingTop: "var(--ui-navbar-height)",
      }}
      paddingX={10}
    >
      {confirmDeleteId !== null && (
        <ConfirmationModal
          title={t("confirmDeleteTitle")}
          text={t("confirmDeleteText")}
          okCallback={handleDelete}
          cancelCallback={() => setConfirmDeleteId(null)}
        />
      )}

      <Box width="100%" maxWidth={520} marginBottom={20} marginTop={20}>
        <Typography as="h1" variant="h2" fontWeight={600} marginBottom={4}>
          {t("title")}
        </Typography>
        <Typography variant="body" color={MUTED}>
          {t("subtitle")}
        </Typography>
      </Box>

      <Box
        display="flex"
        flexDirection="column"
        gap={24}
        width="100%"
        maxWidth={520}
        marginBottom={40}
      >
        <Box
          width="100%"
          padding={10}
          borderRadius={12}
          flexDirection="column"
          gap={16}
          elevation={5}
          backgroundColor="var(--surface-1)"
        >
          <Typography as="h2" variant="h3" fontWeight={600}>
            {t("bucketsTitle")}
          </Typography>
          {loading && <ProgressBar label={t("loading")} />}
          {!loading && buckets.length === 0 && (
            <Typography variant="caption" color={MUTED}>
              {t("noBuckets")}
            </Typography>
          )}
          <Box display="flex" flexDirection="column" gap={8}>
            {buckets.map((bucket) => (
              <BucketRow
                key={bucket.id}
                bucket={bucket}
                onDelete={setConfirmDeleteId}
              />
            ))}
          </Box>
          {toast &&
            (toast.isError ? (
              <ErrorMessage message={toast.message} />
            ) : (
              <SuccessMessage message={toast.message} />
            ))}
        </Box>

        <AddBucketForm
          onCreated={(bucket) => {
            setBuckets((prev) => [...prev, bucket]);
            setToast({ message: t("saved"), isError: false });
          }}
        />
      </Box>
    </Container>
  );
}

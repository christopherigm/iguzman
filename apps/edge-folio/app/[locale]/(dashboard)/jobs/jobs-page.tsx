"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Container } from "@repo/ui/core-elements/container";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { Badge } from "@repo/ui/core-elements/badge";
import { Select } from "@repo/ui/core-elements/select";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Toast } from "@repo/ui/core-elements/toast";
import { Switch } from "@repo/ui/core-elements/switch";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import {
  getJobFeed,
  saveJob,
  deleteJob,
  triggerJobFetch,
  getJobCredentials,
  JobsError,
  type JobPosting,
  type JobCountry,
  type JobWorkType,
} from "@/lib/jobs";
import { getProfile } from "@/lib/auth";
import "./jobs-page.css";

const COUNTRIES: JobCountry[] = ["us", "ca", "mx"];
const WORK_TYPES: JobWorkType[] = ["remote", "onsite", "hybrid"];
const PER_PAGE = 20;

function formatSalary(posting: JobPosting): string | null {
  const min = posting.salary_min
    ? Math.round(Number(posting.salary_min))
    : null;
  const max = posting.salary_max
    ? Math.round(Number(posting.salary_max))
    : null;
  if (min == null && max == null) return null;
  const cur = posting.salary_currency ? `${posting.salary_currency} ` : "";
  const fmt = (n: number) => n.toLocaleString();
  if (min != null && max != null) return `${cur}${fmt(min)}–${fmt(max)}`;
  return `${cur}${fmt((min ?? max) as number)}`;
}

// ── Job card ──────────────────────────────────────────────────────────────────

interface JobCardProps {
  posting: JobPosting;
  onSave: (posting: JobPosting) => void;
  onDelete: (posting: JobPosting) => void;
  saving: boolean;
  deleting: boolean;
  savedAppId: number | null;
  isStaff: boolean;
}

function JobCard({
  posting,
  onSave,
  onDelete,
  saving,
  deleting,
  savedAppId,
  isStaff,
}: JobCardProps) {
  const t = useTranslations("JobsPage");
  const locale = useLocale();
  const salary = formatSalary(posting);
  const date = new Date(posting.created).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <Card gap={8}>
      <Box display="flex" alignItems="flex-start" gap={10}>
        <Box
          display="flex"
          alignItems="center"
          justifyContent="center"
          styles={{
            width: 48,
            height: 48,
            flexShrink: 0,
            borderRadius: 8,
            background: "var(--surface-2)",
          }}
        >
          <Typography
            as="span"
            variant="h3"
            fontWeight={700}
            color="var(--muted-foreground, #6b7280)"
          >
            {(posting.company_name || "?").charAt(0).toUpperCase()}
          </Typography>
        </Box>
        <Box
          display="flex"
          flexDirection="column"
          gap={2}
          flex={1}
          styles={{ minWidth: 0 }}
        >
          <Box display="flex" alignItems="center" gap={6} flexWrap="wrap">
            {posting.is_private && (
              <Badge
                variant="subtle"
                color="#8b5cf6"
                style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}
              >
                {t("privateBadge")}
              </Badge>
            )}
            {posting.score > 0 && (
              <Badge
                variant="subtle"
                color="#06b6d4"
                style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}
              >
                {t("matchBadge")}
              </Badge>
            )}
          </Box>
          <Typography
            as="p"
            variant="body-sm"
            fontWeight={600}
            color="var(--foreground)"
            marginTop={2}
          >
            {posting.job_title}
          </Typography>
          <Typography
            variant="caption"
            color="var(--muted-foreground, #6b7280)"
          >
            {posting.company_name}
          </Typography>
        </Box>
      </Box>

      <Box display="flex" gap={6} flexWrap="wrap">
        {posting.location && (
          <Badge variant="subtle" color="#6b7280">
            {posting.location}
          </Badge>
        )}
        {(posting.work_type ?? []).map((wt) => (
          <Badge key={wt} variant="subtle" color="#0ea5e9">
            {t(`workTypes.${wt}`)}
          </Badge>
        ))}
        {salary && (
          <Badge variant="subtle" color="#22c55e">
            {salary}
          </Badge>
        )}
      </Box>

      <Typography
        variant="caption"
        color="var(--muted-foreground, #6b7280)"
        styles={{
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {posting.job_description}
      </Typography>

      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        marginTop={4}
        gap={8}
      >
        <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
          {date}
        </Typography>
        <Box display="flex" gap={6} alignItems="center">
          <a
            href={posting.job_url}
            target="_blank"
            rel="noopener noreferrer"
            className="jobs__external-link"
          >
            {t("viewPosting")}
          </a>
          {savedAppId != null ? (
            <Link
              href={`/${locale}/applications/${savedAppId}`}
              prefetch
              className="jobs__saved-link"
            >
              {t("tailor")}
            </Link>
          ) : (
            <Button
              text={saving ? t("saving") : t("save")}
              type="button"
              size="md"
              kind="success"
              disabled={saving}
              onClick={() => onSave(posting)}
            />
          )}
          {isStaff && (
            <Button
              text={deleting ? t("deleting") : t("deletePosting")}
              type="button"
              size="md"
              disabled={deleting}
              onClick={() => onDelete(posting)}
            />
          )}
        </Box>
      </Box>
    </Card>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function JobsPage() {
  const t = useTranslations("JobsPage");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const country = (searchParams.get("country") || "") as JobCountry | "";
  const workType = (searchParams.get("work_type") || "") as JobWorkType | "";
  const q = searchParams.get("q") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);

  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [savedMap, setSavedMap] = useState<Record<number, number>>({});
  const [matchOnly, setMatchOnly] = useState(false);
  const [searchInput, setSearchInput] = useState(q);
  const [toast, setToast] = useState<{
    text: string;
    kind: "success" | "error";
  } | null>(null);
  const [toastKey, setToastKey] = useState(0);
  const [isStaff, setIsStaff] = useState(false);
  // BYOK users with at least one active stored key may also fetch jobs (billed
  // to their own provider quota), producing private postings only they can see.
  const [canFetch, setCanFetch] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<JobPosting | null>(null);

  function showToast(text: string, kind: "success" | "error") {
    setToast({ text, kind });
    setToastKey((k) => k + 1);
  }

  const setParam = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      // Any filter change resets pagination.
      if (!("page" in updates)) params.delete("page");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getJobFeed({
        country,
        work_type: workType,
        q,
        page,
        per: PER_PAGE,
      });
      setPostings(res.results);
      setCount(res.count);
    } catch {
      setError(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [country, workType, q, page, t]);

  useEffect(() => {
    load();
  }, [load]);

  // Surface the "Fetch Jobs" control for staff (shared catalog) and for BYOK
  // users with a stored key (private feed). Anonymous users keep both false.
  useEffect(() => {
    let active = true;
    Promise.all([
      getProfile().catch(() => null),
      getJobCredentials().catch(() => []),
    ]).then(([profile, creds]) => {
      if (!active) return;
      setIsStaff(Boolean(profile?.is_staff));
      setCanFetch(creds.some((c) => c.is_active && c.has_key));
    });
    return () => {
      active = false;
    };
  }, []);

  const handleFetch = useCallback(async () => {
    setFetching(true);
    try {
      await triggerJobFetch();
      showToast(t("fetchStarted"), "success");
      // The fetch runs async on a worker; refresh shortly to surface new jobs.
      setTimeout(() => load(), 3000);
    } catch (err) {
      const isLimit = err instanceof JobsError && err.status === 429;
      showToast(isLimit ? t("fetchLimitReached") : t("fetchError"), "error");
    } finally {
      setFetching(false);
    }
  }, [t, load]);

  // Debounce the search box into the URL query param.
  useEffect(() => {
    if (searchInput === q) return;
    const id = setTimeout(() => setParam({ q: searchInput }), 400);
    return () => clearTimeout(id);
  }, [searchInput, q, setParam]);

  const handleSave = useCallback(
    async (posting: JobPosting) => {
      setSavingId(posting.id);
      try {
        const app = await saveJob(posting.id);
        setSavedMap((prev) => ({ ...prev, [posting.id]: app.id }));
        showToast(t("saved"), "success");
      } catch (err) {
        const isAuth = err instanceof JobsError && err.status === 401;
        showToast(isAuth ? t("errorUnauthorized") : t("errorSave"), "error");
      } finally {
        setSavingId(null);
      }
    },
    [t],
  );

  const handleDelete = useCallback((posting: JobPosting) => {
    setPendingDelete(posting);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const posting = pendingDelete;
    setPendingDelete(null);
    setDeletingId(posting.id);
    try {
      await deleteJob(posting.id);
      setPostings((prev) => prev.filter((p) => p.id !== posting.id));
      setCount((prev) => prev - 1);
      showToast(t("deleted"), "success");
    } catch {
      showToast(t("errorDelete"), "error");
    } finally {
      setDeletingId(null);
    }
  }, [pendingDelete, t]);

  const visiblePostings = matchOnly
    ? postings.filter((p) => p.score > 0)
    : postings;

  const totalPages = Math.max(1, Math.ceil(count / PER_PAGE));

  const filterChips = useMemo(
    () => (
      <Box
        display="flex"
        gap={12}
        flexWrap="wrap"
        alignItems="flex-end"
        marginBottom={20}
      >
        <Box styles={{ minWidth: 160, flex: 1 }}>
          <TextInput
            label={t("searchLabel")}
            value={searchInput}
            onChange={setSearchInput}
            placeholder={t("searchPlaceholder")}
            width="100%"
            aria-label={t("searchLabel")}
          />
        </Box>
        <Box
          display="flex"
          alignItems="center"
          gap={8}
          styles={{ paddingBottom: 6 }}
        >
          <Switch
            checked={matchOnly}
            onChange={setMatchOnly}
            aria-label={t("matchOnlyLabel")}
          />
          <Typography
            variant="caption"
            color="var(--muted-foreground, #6b7280)"
          >
            {t("matchOnlyLabel")}
          </Typography>
        </Box>
        <Box styles={{ minWidth: 140 }}>
          <Select
            label={t("countryLabel")}
            value={country}
            onChange={(v) => setParam({ country: v })}
            options={[
              { value: "", label: t("countryAll") },
              ...COUNTRIES.map((c) => ({
                value: c,
                label: t(`countries.${c}`),
              })),
            ]}
            width="100%"
          />
        </Box>
        <Box styles={{ minWidth: 140 }}>
          <Select
            label={t("workTypeLabel")}
            value={workType}
            onChange={(v) => setParam({ work_type: v })}
            options={[
              { value: "", label: t("workTypeAll") },
              ...WORK_TYPES.map((w) => ({
                value: w,
                label: t(`workTypes.${w}`),
              })),
            ]}
            width="100%"
          />
        </Box>
      </Box>
    ),
    [searchInput, matchOnly, country, workType, t, setParam],
  );

  return (
    <Container
      paddingX={10}
      styles={{ paddingTop: "var(--ui-navbar-height)", paddingBottom: "60px" }}
    >
      <Box
        width="100%"
        marginTop={24}
        marginBottom={24}
        display="flex"
        alignItems="flex-start"
        justifyContent="space-between"
        gap={16}
        flexWrap="wrap"
      >
        <Box display="flex" flexDirection="column" gap={4}>
          <Typography as="h1" variant="h2" fontWeight={600} marginBottom={4}>
            {t("title")}
          </Typography>
          <Typography
            variant="body-sm"
            color="var(--muted-foreground, #6b7280)"
          >
            {t("subtitle")}
          </Typography>
        </Box>
        {(isStaff || canFetch) && (
          <Button
            text={fetching ? t("fetching") : t("fetchJobs")}
            type="button"
            size="md"
            kind="success"
            disabled={fetching}
            onClick={handleFetch}
          />
        )}
      </Box>

      {filterChips}

      {loading ? (
        <Box display="flex" justifyContent="center" paddingY={60}>
          <ProgressBar label={t("loading")} />
        </Box>
      ) : error ? (
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          gap={16}
          paddingY={60}
        >
          <Typography variant="body-sm" color="var(--error, #ef4444)">
            {error}
          </Typography>
          <Button
            text={t("retry")}
            type="button"
            size="md"
            kind="success"
            onClick={load}
          />
        </Box>
      ) : visiblePostings.length === 0 ? (
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          gap={12}
          paddingY={60}
          paddingX={24}
          border="2px dashed var(--border, #e5e7eb)"
          borderRadius={16}
          styles={{ textAlign: "center" }}
        >
          <Typography
            variant="h3"
            fontWeight={600}
            color="var(--muted-foreground, #6b7280)"
          >
            {t("emptyTitle")}
          </Typography>
          <Typography
            variant="body-sm"
            color="var(--muted-foreground, #6b7280)"
          >
            {t("emptyBody")}
          </Typography>
        </Box>
      ) : (
        <>
          <Box
            display="grid"
            gap={16}
            styles={{
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            }}
          >
            {visiblePostings.map((posting) => (
              <JobCard
                key={posting.id}
                posting={posting}
                onSave={handleSave}
                onDelete={handleDelete}
                saving={savingId === posting.id}
                deleting={deletingId === posting.id}
                savedAppId={
                  savedMap[posting.id] ?? posting.saved_application_id
                }
                isStaff={isStaff}
              />
            ))}
          </Box>

          {totalPages > 1 && (
            <Box
              display="flex"
              alignItems="center"
              justifyContent="center"
              gap={12}
              marginTop={24}
            >
              <Button
                text={t("prev")}
                type="button"
                size="md"
                disabled={page <= 1}
                onClick={() => setParam({ page: String(page - 1) })}
              />
              <Typography
                variant="body-sm"
                color="var(--muted-foreground, #6b7280)"
              >
                {t("pageOf", { page, total: totalPages })}
              </Typography>
              <Button
                text={t("next")}
                type="button"
                size="md"
                disabled={page >= totalPages}
                onClick={() => setParam({ page: String(page + 1) })}
              />
            </Box>
          )}
        </>
      )}

      {toast && (
        <Toast
          key={toastKey}
          message={toast.text}
          variant={toast.kind}
          position="top-center"
        />
      )}

      {pendingDelete && (
        <ConfirmationModal
          title={t("confirmDeleteTitle")}
          text={t("confirmDeleteText")}
          okCallback={confirmDelete}
          cancelCallback={() => setPendingDelete(null)}
        />
      )}
    </Container>
  );
}

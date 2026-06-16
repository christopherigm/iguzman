"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Container } from "@repo/ui/core-elements/container";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
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
  type JobScope,
} from "@/lib/jobs";
import { getProfile } from "@/lib/auth";
import { JobCard } from "./job-card";

const COUNTRIES: JobCountry[] = ["us", "ca", "mx"];
const WORK_TYPES: JobWorkType[] = ["remote", "onsite", "hybrid"];
const PER_PAGE = 20;

// ── Job list (one scope) ────────────────────────────────────────────────────

interface JobListFilters {
  country: JobCountry | "";
  workType: JobWorkType | "";
  q: string;
  page: number;
}

interface JobListState {
  postings: JobPosting[];
  count: number;
  loading: boolean;
  error: boolean;
  reload: () => void;
  removePosting: (id: number) => void;
}

// Loads one paginated slice of the feed for a single scope (private/shared).
// The two lists share the same filters but page independently.
function useJobList(scope: JobScope, filters: JobListFilters): JobListState {
  const { country, workType, q, page } = filters;
  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await getJobFeed({
        scope,
        country,
        work_type: workType,
        q,
        page,
        per: PER_PAGE,
      });
      setPostings(res.results);
      setCount(res.count);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [scope, country, workType, q, page]);

  useEffect(() => {
    load();
  }, [load]);

  const removePosting = useCallback((id: number) => {
    setPostings((prev) => {
      if (!prev.some((p) => p.id === id)) return prev;
      setCount((c) => c - 1);
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  return { postings, count, loading, error, reload: load, removePosting };
}

// ── Job list section (heading + grid + pagination) ──────────────────────────

interface JobSectionProps {
  title: string;
  list: JobListState;
  page: number;
  onPageChange: (page: number) => void;
  matchOnly: boolean;
  onSave: (posting: JobPosting) => void;
  onDelete: (posting: JobPosting) => void;
  savingId: number | null;
  deletingId: number | null;
  savedMap: Record<number, number>;
  isStaff: boolean;
}

function JobSection({
  title,
  list,
  page,
  onPageChange,
  matchOnly,
  onSave,
  onDelete,
  savingId,
  deletingId,
  savedMap,
  isStaff,
}: JobSectionProps) {
  const t = useTranslations("JobsPage");
  const visible = matchOnly
    ? list.postings.filter((p) => p.score > 0)
    : list.postings;

  // Hide the whole section once it has finished loading with no results.
  if (!list.loading && !list.error && visible.length === 0) return null;

  const totalPages = Math.max(1, Math.ceil(list.count / PER_PAGE));

  return (
    <Box display="flex" flexDirection="column" gap={12} marginBottom={32}>
      <Box display="flex" alignItems="baseline" gap={8}>
        <Typography as="h2" variant="h3" fontWeight={600}>
          {title}
        </Typography>
        {!list.loading && !list.error && (
          <Typography
            variant="body"
            color="var(--muted-foreground, #6b7280)"
          >
            {list.count}
          </Typography>
        )}
      </Box>

      {list.loading ? (
        <Box display="flex" justifyContent="center" paddingY={40}>
          <ProgressBar label={t("loading")} />
        </Box>
      ) : list.error ? (
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          gap={16}
          paddingY={40}
        >
          <Typography variant="body" color="var(--error, #ef4444)">
            {t("errorLoad")}
          </Typography>
          <Button
            text={t("retry")}
            type="button"
            size="md"
            kind="success"
            onClick={list.reload}
          />
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
            {visible.map((posting) => (
              <JobCard
                key={posting.id}
                posting={posting}
                onSave={onSave}
                onDelete={onDelete}
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
              marginTop={20}
            >
              <Button
                text={t("prev")}
                type="button"
                size="md"
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
              />
              <Typography
                variant="body"
                color="var(--muted-foreground, #6b7280)"
              >
                {t("pageOf", { page, total: totalPages })}
              </Typography>
              <Button
                text={t("next")}
                type="button"
                size="md"
                disabled={page >= totalPages}
                onClick={() => onPageChange(page + 1)}
              />
            </Box>
          )}
        </>
      )}
    </Box>
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
  const pagePrivate = Math.max(
    1,
    parseInt(searchParams.get("page_private") || "1", 10) || 1,
  );
  const pageShared = Math.max(
    1,
    parseInt(searchParams.get("page_shared") || "1", 10) || 1,
  );

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
      // A filter change (anything other than a page move) resets both lists'
      // pagination so each starts from page 1 against the new filters.
      const isPageMove = "page_private" in updates || "page_shared" in updates;
      if (!isPageMove) {
        params.delete("page_private");
        params.delete("page_shared");
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  const privateList = useJobList("private", {
    country,
    workType,
    q,
    page: pagePrivate,
  });
  const sharedList = useJobList("shared", {
    country,
    workType,
    q,
    page: pageShared,
  });

  const reloadAll = useCallback(() => {
    privateList.reload();
    sharedList.reload();
  }, [privateList, sharedList]);

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
      setTimeout(() => reloadAll(), 3000);
    } catch (err) {
      const isLimit = err instanceof JobsError && err.status === 429;
      showToast(isLimit ? t("fetchLimitReached") : t("fetchError"), "error");
    } finally {
      setFetching(false);
    }
  }, [t, reloadAll]);

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
      // The posting lives in exactly one list; remove from both (no-op on the
      // other) so staff deleting a shared posting and owners deleting a private
      // one both update the right grid.
      privateList.removePosting(posting.id);
      sharedList.removePosting(posting.id);
      showToast(t("deleted"), "success");
    } catch {
      showToast(t("errorDelete"), "error");
    } finally {
      setDeletingId(null);
    }
  }, [pendingDelete, t, privateList, sharedList]);

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
            variant="body"
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

  const visibleCount = (list: JobListState) =>
    (matchOnly ? list.postings.filter((p) => p.score > 0) : list.postings)
      .length;

  // One spinner on the very first load (both lists pending, no data yet);
  // afterwards each section manages its own loading state for page moves.
  const initialLoading =
    privateList.loading &&
    sharedList.loading &&
    privateList.postings.length === 0 &&
    sharedList.postings.length === 0;
  const bothEmpty =
    !privateList.loading &&
    !sharedList.loading &&
    !privateList.error &&
    !sharedList.error &&
    visibleCount(privateList) === 0 &&
    visibleCount(sharedList) === 0;

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
          <Typography variant="body" color="var(--muted-foreground, #6b7280)">
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

      {initialLoading ? (
        <Box display="flex" justifyContent="center" paddingY={60}>
          <ProgressBar label={t("loading")} />
        </Box>
      ) : bothEmpty ? (
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
          <Typography variant="body" color="var(--muted-foreground, #6b7280)">
            {t("emptyBody")}
          </Typography>
        </Box>
      ) : (
        <>
          <JobSection
            title={t("privateListTitle")}
            list={privateList}
            page={pagePrivate}
            onPageChange={(p) => setParam({ page_private: String(p) })}
            matchOnly={matchOnly}
            onSave={handleSave}
            onDelete={handleDelete}
            savingId={savingId}
            deletingId={deletingId}
            savedMap={savedMap}
            isStaff={isStaff}
          />
          <JobSection
            title={t("sharedListTitle")}
            list={sharedList}
            page={pageShared}
            onPageChange={(p) => setParam({ page_shared: String(p) })}
            matchOnly={matchOnly}
            onSave={handleSave}
            onDelete={handleDelete}
            savingId={savingId}
            deletingId={deletingId}
            savedMap={savedMap}
            isStaff={isStaff}
          />
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

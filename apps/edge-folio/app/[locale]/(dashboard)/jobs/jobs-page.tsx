"use client";

import {
  Fragment,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Container } from "@repo/ui/core-elements/container";
import { Box } from "@repo/ui/core-elements/box";
import { Grid } from "@repo/ui/core-elements/grid";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { Select } from "@repo/ui/core-elements/select";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Toast } from "@repo/ui/core-elements/toast";
import { Badge } from "@repo/ui/core-elements/badge";
import { Spinner } from "@repo/ui/core-elements/spinner";
import { Divider } from "@repo/ui/core-elements/divider";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import {
  getJobFeed,
  saveJob,
  deleteJob,
  triggerJobFetch,
  getJobCredentials,
  getJobSearches,
  JobsError,
  type JobPosting,
  type JobSearch,
  type JobCountry,
  type JobWorkType,
  type JobScope,
} from "@/lib/jobs";
import { getProfile } from "@/lib/auth";
import { JobCard } from "./job-card";
import { JobSearchPanel } from "../profile/job-search-section";
import Card from "@repo/ui/core-elements/card";
import "./jobs-page.css";

const COUNTRIES: JobCountry[] = ["us", "ca", "mx"];
const WORK_TYPES: JobWorkType[] = ["remote", "onsite", "hybrid"];
const PER_PAGE = 20;
const POLL_INTERVAL = 5000;

type MatchBucket = "match" | "semi" | "no";

// Curated bucket for a scored private posting. An explicit citizenship requirement
// or a missing/low score lands in "No match"; 85+ is "Match"; 60-84 is "Semi-match".
function bucketOf(posting: JobPosting): MatchBucket {
  if (posting.us_citizen_or_pr_required) return "no";
  const m = posting.overall_match;
  if (m == null) return "no";
  if (m >= 85) return "match";
  if (m >= 60) return "semi";
  return "no";
}

const SEARCH_STATUS_COLORS: Record<JobSearch["status"], string> = {
  running: "#f59e0b",
  done: "#22c55e",
  failed: "#ef4444",
};

// Colors for the per-search match tallies, mirroring the bucket semantics.
const MATCH_COLORS = {
  strong: "#22c55e",
  possible: "#f59e0b",
  low: "var(--muted-foreground, #6b7280)",
};

// ── Job list (one scope) ────────────────────────────────────────────────────

interface JobListFilters {
  country: JobCountry | "";
  workType: JobWorkType | "";
  q: string;
  // When set, restricts the list to postings from a single JobSearch run.
  search: number | null;
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
  const { country, workType, q, search, page } = filters;
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
        search: search ?? undefined,
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
  }, [scope, country, workType, q, search, page]);

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
  onSave,
  onDelete,
  savingId,
  deletingId,
  savedMap,
  isStaff,
}: JobSectionProps) {
  const t = useTranslations("JobsPage");

  // Hide the whole section once it has finished loading with no results.
  if (!list.loading && !list.error && list.postings.length === 0) return null;

  const totalPages = Math.max(1, Math.ceil(list.count / PER_PAGE));

  return (
    <Box display="flex" flexDirection="column" gap={12} marginBottom={32}>
      <Box display="flex" alignItems="baseline" gap={8}>
        <Typography as="h2" variant="h3" fontWeight={600}>
          {title}
        </Typography>
        {!list.loading && !list.error && (
          <Typography variant="body" color="var(--muted-foreground, #6b7280)">
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
          <Grid container spacing={2}>
            {list.postings.map((posting) => (
              <Grid key={posting.id} size={{ xs: 12, sm: 6, md: 4 }}>
                <JobCard
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
              </Grid>
            ))}
          </Grid>

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
                kind="success"
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
                kind="success"
              />
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

// ── Recent job searches card ────────────────────────────────────────────────

interface JobSearchesCardProps {
  searches: JobSearch[];
  // The currently active search filter (null when none), and the toggle handler.
  selectedSearchId: number | null;
  onSelect: (id: number) => void;
}

function JobSearchesCard({
  searches,
  selectedSearchId,
  onSelect,
}: JobSearchesCardProps) {
  const t = useTranslations("JobsPage");
  if (searches.length === 0) return null;

  // Always render the most recently created search on top.
  const sorted = [...searches].sort(
    (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime(),
  );

  return (
    <Card gap={6} marginBottom={20}>
      <Typography variant="body" fontWeight={600} color="var(--foreground)">
        {t("recentSearchesTitle")}
      </Typography>
      <Box display="flex" flexDirection="column" gap={4}>
        {sorted.map((s, i) => {
          const date = new Date(s.created).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
          const selected = selectedSearchId === s.id;
          const label = s.query || t("recentSearchesUntitled");
          return (
            <Fragment key={s.id}>
              {i > 0 && <Divider />}
              <Box
                className="jobs__search-item"
                role="button"
                tabIndex={0}
                aria-label={label}
                onClick={() => onSelect(s.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(s.id);
                  }
                }}
                display="flex"
                flexDirection="column"
                gap={6}
                border={
                  selected
                    ? "1px solid var(--primary, #06b6d4)"
                    : "1px solid transparent"
                }
                borderRadius={8}
                padding={8}
              >
                {/* Status badge + datetime, above the query. */}
                <Box display="flex" alignItems="center" gap={8}>
                  <Badge
                    variant="subtle"
                    color={SEARCH_STATUS_COLORS[s.status]}
                  >
                    {t(`searchStatuses.${s.status}`)}
                  </Badge>
                  <Typography
                    variant="caption"
                    color="var(--muted-foreground, #6b7280)"
                  >
                    {date}
                  </Typography>
                </Box>

                {/* Query on the left; status/tally baseline-aligned to its far
                    right on desktop, stacked below it on mobile. */}
                <Box className="jobs__search-row">
                  {/* Query (+ location). Never truncated, regardless of width. */}
                  <Box display="flex" alignItems="center" gap={8}>
                    {s.status === "running" && <Spinner size={14} />}
                    <Typography
                      variant="body"
                      color="var(--foreground)"
                      fontWeight={500}
                    >
                      {s.location ? `${label} (${s.location})` : label}
                    </Typography>
                  </Box>

                  {/* While running, show scoring progress; once done, show the
                      match tally (or an empty-state line when nothing was found). */}
                  {s.status === "running" ? (
                    <Typography
                      variant="body"
                      color="var(--muted-foreground, #6b7280)"
                    >
                      {t("recentSearchesProgress", {
                        completed: s.metrics_completed,
                        total: s.jobs_found,
                      })}
                    </Typography>
                  ) : s.status === "done" ? (
                    s.jobs_found === 0 ? (
                      <Typography
                        variant="body"
                        color="var(--muted-foreground, #6b7280)"
                      >
                        {t("recentSearchesNoPostings")}
                      </Typography>
                    ) : (
                      <Box
                        display="flex"
                        alignItems="center"
                        flexWrap="wrap"
                        gap={8}
                      >
                        <Typography variant="body" color={MATCH_COLORS.strong}>
                          {t("recentSearchesStrong", { count: s.strong })}
                        </Typography>
                        <Typography
                          variant="body"
                          color={MATCH_COLORS.possible}
                        >
                          {t("recentSearchesPossible", { count: s.possible })}
                        </Typography>
                        <Typography variant="body" color={MATCH_COLORS.low}>
                          {t("recentSearchesLow", { count: s.low })}
                        </Typography>
                      </Box>
                    )
                  ) : null}
                </Box>
              </Box>
            </Fragment>
          );
        })}
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
  // Active "filter by search run" selection, surfaced from the URL so it survives
  // reloads and resets pagination through setParam like any other filter.
  const searchFilter = parseInt(searchParams.get("search") || "", 10) || null;
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
  const [refineOpen, setRefineOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<JobPosting | null>(null);
  const [searches, setSearches] = useState<JobSearch[]>([]);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A fetch is in flight on the server; the button stays disabled until it finishes.
  const running = searches.some((s) => s.status === "running");

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
    search: searchFilter,
    page: pagePrivate,
  });
  const sharedList = useJobList("shared", {
    country,
    workType,
    q,
    // The shared catalog has no per-search association; it is hidden entirely
    // while a search filter is active, so it never receives one.
    search: null,
    page: pageShared,
  });

  // Toggle the search filter: selecting the active one clears it.
  const handleSelectSearch = useCallback(
    (id: number) => {
      setParam({ search: searchFilter === id ? "" : String(id) });
    },
    [searchFilter, setParam],
  );

  // Stable ref to the latest private reload so the poll loop (started once) always
  // calls the current version without having to re-subscribe.
  const privateReloadRef = useRef(privateList.reload);
  privateReloadRef.current = privateList.reload;

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const loadSearches = useCallback(async () => {
    try {
      const data = await getJobSearches();
      setSearches(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  // Poll the searches endpoint while a fetch is running (mirrors the tailoring poll
  // on the application detail page). Each tick refreshes the searches card and, when
  // a posting finishes scoring (progress advances) or the run ends, reloads the
  // private list so newly scored postings surface live.
  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    let lastProgress = -1;
    const tick = async () => {
      const data = await getJobSearches().catch(() => null);
      if (data) {
        setSearches(data);
        const active = data.find((s) => s.status === "running");
        const progress = active ? active.metrics_completed : -1;
        if (progress !== lastProgress) {
          lastProgress = progress;
          privateReloadRef.current();
        }
        if (!active) {
          pollRef.current = null;
          return;
        }
      }
      pollRef.current = setTimeout(tick, POLL_INTERVAL);
    };
    pollRef.current = setTimeout(tick, POLL_INTERVAL);
  }, []);

  // Load recent searches on mount; resume polling if one is still running.
  useEffect(() => {
    loadSearches().then((data) => {
      if (data?.some((s) => s.status === "running")) startPolling();
    });
    return () => stopPolling();
  }, [loadSearches, startPolling, stopPolling]);

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
      // Surface the new running search immediately, then poll for scoring progress.
      await loadSearches();
      startPolling();
    } catch (err) {
      if (err instanceof JobsError && err.status === 409) {
        showToast(t("fetchAlreadyRunning"), "error");
        loadSearches();
      } else if (err instanceof JobsError && err.status === 429) {
        showToast(t("fetchLimitReached"), "error");
      } else {
        showToast(t("fetchError"), "error");
      }
    } finally {
      setFetching(false);
    }
  }, [t, loadSearches, startPolling]);

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
      <Card
        display="flex"
        flexDirection="row"
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
      </Card>
    ),
    [searchInput, country, workType, t, setParam],
  );

  const visibleCount = (list: JobListState) => list.postings.length;

  const byCreatedDesc = (a: JobPosting, b: JobPosting) =>
    new Date(b.created).getTime() - new Date(a.created).getTime();

  // Group the loaded private postings into curated buckets, newest first within each.
  const privateBuckets = useMemo(() => {
    const groups: Record<MatchBucket, JobPosting[]> = {
      match: [],
      semi: [],
      no: [],
    };
    for (const p of privateList.postings) groups[bucketOf(p)].push(p);
    (Object.keys(groups) as MatchBucket[]).forEach((k) =>
      groups[k].sort(byCreatedDesc),
    );
    return groups;
  }, [privateList.postings]);

  // Each bucket reuses JobSection; loading/error/pagination for the private list as a
  // whole are handled separately, so a per-bucket section never paginates on its own.
  const bucketList = (postings: JobPosting[]): JobListState => ({
    postings,
    count: postings.length,
    loading: false,
    error: false,
    reload: privateList.reload,
    removePosting: privateList.removePosting,
  });

  // One spinner on the very first load (both lists pending, no data yet);
  // afterwards each section manages its own loading state for page moves.
  const initialLoading =
    privateList.loading &&
    sharedList.loading &&
    privateList.postings.length === 0 &&
    sharedList.postings.length === 0;
  // While a search filter is active the shared list is hidden, so the empty
  // state hinges on the (filtered) private list alone.
  const bothEmpty = searchFilter
    ? !privateList.loading &&
      !privateList.error &&
      privateList.postings.length === 0
    : !privateList.loading &&
      !sharedList.loading &&
      !privateList.error &&
      !sharedList.error &&
      privateList.postings.length === 0 &&
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
          <Box display="flex" alignItems="center" gap={12} flexWrap="wrap">
            <Button
              text={t("refineSearch")}
              type="button"
              size="md"
              kind="success"
              iconSize="16px"
              onClick={() => setRefineOpen(true)}
            />
            <Button
              text={
                running
                  ? t("searchRunning")
                  : fetching
                    ? t("fetching")
                    : t("fetchJobs")
              }
              type="button"
              size="md"
              kind="success"
              disabled={fetching || running}
              onClick={handleFetch}
            />
          </Box>
        )}
      </Box>

      <JobSearchesCard
        searches={searches}
        selectedSearchId={searchFilter}
        onSelect={handleSelectSearch}
      />

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
          {privateList.error && privateList.postings.length === 0 ? (
            <Box
              display="flex"
              flexDirection="column"
              alignItems="center"
              gap={16}
              paddingY={40}
              marginBottom={32}
            >
              <Typography variant="body" color="var(--error, #ef4444)">
                {t("errorLoad")}
              </Typography>
              <Button
                text={t("retry")}
                type="button"
                size="md"
                kind="success"
                onClick={privateList.reload}
              />
            </Box>
          ) : (
            <>
              {(
                [
                  ["match", t("bucketMatch")],
                  ["semi", t("bucketSemi")],
                  ["no", t("bucketNo")],
                ] as Array<[MatchBucket, string]>
              ).map(([bucket, title]) => (
                <JobSection
                  key={bucket}
                  title={title}
                  list={bucketList(privateBuckets[bucket])}
                  page={1}
                  onPageChange={() => {}}
                  onSave={handleSave}
                  onDelete={handleDelete}
                  savingId={savingId}
                  deletingId={deletingId}
                  savedMap={savedMap}
                  isStaff={isStaff}
                />
              ))}
              {privateList.count > PER_PAGE && (
                <Box
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  gap={12}
                  marginTop={4}
                  marginBottom={32}
                >
                  <Button
                    text={t("prev")}
                    type="button"
                    size="md"
                    kind="success"
                    disabled={pagePrivate <= 1}
                    onClick={() =>
                      setParam({ page_private: String(pagePrivate - 1) })
                    }
                  />
                  <Typography
                    variant="body"
                    color="var(--muted-foreground, #6b7280)"
                  >
                    {t("pageOf", {
                      page: pagePrivate,
                      total: Math.max(
                        1,
                        Math.ceil(privateList.count / PER_PAGE),
                      ),
                    })}
                  </Typography>
                  <Button
                    text={t("next")}
                    type="button"
                    size="md"
                    kind="success"
                    disabled={
                      pagePrivate >= Math.ceil(privateList.count / PER_PAGE)
                    }
                    onClick={() =>
                      setParam({ page_private: String(pagePrivate + 1) })
                    }
                  />
                </Box>
              )}
            </>
          )}
          {/* A search run owns only private postings, so hide the shared
              catalog entirely while filtering by a specific search. */}
          {!searchFilter && (
            <JobSection
              title={t("sharedListTitle")}
              list={sharedList}
              page={pageShared}
              onPageChange={(p) => setParam({ page_shared: String(p) })}
              onSave={handleSave}
              onDelete={handleDelete}
              savingId={savingId}
              deletingId={deletingId}
              savedMap={savedMap}
              isStaff={isStaff}
            />
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

      {refineOpen && (
        <ConfirmationModal
          title={t("refineSearchTitle")}
          text={t("refineSearchText")}
          okCallback={() => setRefineOpen(false)}
          cancelCallback={() => setRefineOpen(false)}
          panelMaxWidth="640px"
        >
          <JobSearchPanel />
        </ConfirmationModal>
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

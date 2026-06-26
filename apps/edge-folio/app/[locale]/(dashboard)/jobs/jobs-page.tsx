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
import { Switch } from "@repo/ui/core-elements/switch";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Toast } from "@repo/ui/core-elements/toast";
import { Badge } from "@repo/ui/core-elements/badge";
import { Spinner } from "@repo/ui/core-elements/spinner";
import { Divider } from "@repo/ui/core-elements/divider";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import {
  getJobFeed,
  getJobLocations,
  saveJob,
  deleteJob,
  triggerJobFetch,
  getJobCredentials,
  getJobSearches,
  JobsError,
  type JobPosting,
  type JobSearch,
  type JobApiCredential,
  type JobWorkType,
  type JobScope,
} from "@/lib/jobs";
import { getProfile } from "@/lib/auth";
import { JobCard } from "./job-card";
import {
  JobSearchPanel,
  type JobSearchPanelHandle,
} from "../profile/job-search-section";
import Card from "@repo/ui/core-elements/card";
import "./jobs-page.css";

const WORK_TYPES: JobWorkType[] = ["remote", "onsite", "hybrid"];
// Page size for every rendered section (each private match bucket and the shared
// catalog) shows this many at a time.
const PER_PAGE = 12;
// The private feed is loaded in one page and bucketed/paginated client-side, so a
// search/filter operates over the full dataset rather than a single server page.
const PRIVATE_FETCH = 300;
const POLL_INTERVAL = 5000;

type MatchBucket = "match" | "semi" | "no";

// Curated bucket for a scored private posting. An explicit citizenship requirement,
// an unmet spoken-language requirement, or a missing/low score lands in "No match";
// 85+ is "Match"; 60-84 is "Semi-match".
function bucketOf(posting: JobPosting): MatchBucket {
  if (posting.us_citizen_or_pr_required) return "no";
  if (posting.language_requirement_unmet) return "no";
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
  location: string;
  workType: JobWorkType | "";
  q: string;
  // When set, restricts the list to postings from a single JobSearch run.
  search: number | null;
  page: number;
  per: number;
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
  const { location, workType, q, search, page, per } = filters;
  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getJobFeed({
        scope,
        location,
        work_type: workType,
        q,
        search: search ?? undefined,
        page,
        per,
      });
      setPostings(res.results);
      setCount(res.count);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [scope, location, workType, q, search, page, per]);

  // Show the spinner and clear any prior error whenever the query changes. Done
  // during render (a sanctioned setState-on-changed-value) rather than inside the
  // fetch effect, which would be a setState-in-effect. `loading` starts true, so
  // the initial mount render matches queryKey and skips the reset.
  const queryKey = `${scope}|${location}|${workType}|${q}|${search}|${page}|${per}`;
  const [loadedKey, setLoadedKey] = useState(queryKey);
  if (loadedKey !== queryKey) {
    setLoadedKey(queryKey);
    setLoading(true);
    setError(false);
  }

  useEffect(() => {
    void (async () => {
      await load();
    })();
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
            kind="primary"
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
                kind="primary"
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
                kind="primary"
              />
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

// ── Recent job searches card ────────────────────────────────────────────────

// Compact usage readout for the credential backing job searches: "Search 1/200"
// over a progress bar whose width tracks the label's own width and whose fill
// reflects the searches consumed. Works for both BYOK and trial credentials -
// the API already exposes the right tally for each via `calls_used_today`.
function SearchUsage({ credential }: { credential: JobApiCredential }) {
  const t = useTranslations("JobsPage");
  const used = credential.calls_used_today;
  const limit = credential.call_limit;
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const label = t("searchUsage", { used, limit });
  return (
    <Box
      display="inline-flex"
      flexDirection="column"
      alignItems="flex-end"
      gap={4}
    >
      <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
        {label}
      </Typography>
      <ProgressBar value={pct} width="100%" label={label} />
    </Box>
  );
}

interface JobSearchesCardProps {
  searches: JobSearch[];
  // The currently active search filter (null when none), and the toggle handler.
  selectedSearchId: number | null;
  onSelect: (id: number) => void;
  // Credential backing the searches (JSearch preferred, else Adzuna); drives the
  // far-right usage readout in the title row. Null when none is available.
  usageCredential: JobApiCredential | null;
}

function JobSearchesCard({
  searches,
  selectedSearchId,
  onSelect,
  usageCredential,
}: JobSearchesCardProps) {
  const t = useTranslations("JobsPage");
  if (searches.length === 0) return null;

  // Always render the most recently created search on top.
  const sorted = [...searches].sort(
    (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime(),
  );

  return (
    <Card gap={6} marginBottom={20}>
      <Box
        display="flex"
        alignItems="flex-start"
        justifyContent="space-between"
        gap={12}
      >
        <Typography variant="body" fontWeight={600} color="var(--foreground)">
          {t("recentSearchesTitle")}
        </Typography>
        {usageCredential && <SearchUsage credential={usageCredential} />}
      </Box>
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
  // The refine modal renders the profile's JobSearchPanel, whose save toasts use
  // the ProfilePage namespace; reuse those keys for the OK-driven save feedback.
  const tProfile = useTranslations("ProfilePage");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const location = searchParams.get("location") || "";
  const workType = (searchParams.get("work_type") || "") as JobWorkType | "";
  const q = searchParams.get("q") || "";
  // "Hide saved jobs" toggle, on by default - hides postings already saved as
  // applications so the lists surface roles still worth acting on. Persisted in
  // the URL ("0" means show saved); the feed API has no saved param, so this
  // filters the loaded data in place.
  const hideSaved = searchParams.get("hide_saved") !== "0";
  // Active "filter by search run" selection, surfaced from the URL so it survives
  // reloads and resets pagination through setParam like any other filter.
  const searchFilter = parseInt(searchParams.get("search") || "", 10) || null;
  // Per-bucket and shared-catalog page numbers (the private feed is bucketed and
  // paginated client-side, so each match group pages independently).
  const readPage = (key: string) =>
    Math.max(1, parseInt(searchParams.get(key) || "1", 10) || 1);
  const pageMatch = readPage("page_match");
  const pageSemi = readPage("page_semi");
  const pageNo = readPage("page_no");
  const pageShared = readPage("page_shared");

  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [savedMap, setSavedMap] = useState<Record<number, number>>({});
  const [searchInput, setSearchInput] = useState(q);
  // Distinct locations across the full dataset (private + shared), for the filter
  // dropdown options.
  const [locationOptions, setLocationOptions] = useState<string[]>([]);
  const [toast, setToast] = useState<{
    text: string;
    kind: "success" | "error";
  } | null>(null);
  const [toastKey, setToastKey] = useState(0);
  const [isStaff, setIsStaff] = useState(false);
  // BYOK users with at least one active stored key may also fetch jobs (billed
  // to their own provider quota), producing private postings only they can see.
  const [canFetch, setCanFetch] = useState(false);
  // Credential whose search usage is shown in the recent-searches header. JSearch
  // is preferred (it backs the trial too); Adzuna is the fallback.
  const [usageCredential, setUsageCredential] =
    useState<JobApiCredential | null>(null);
  const [fetching, setFetching] = useState(false);
  const [refineOpen, setRefineOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<JobPosting | null>(null);
  const [searches, setSearches] = useState<JobSearch[]>([]);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Handle to the refine modal's panel so the modal's OK button can persist the
  // edited preferences before closing.
  const jobSearchPanelRef = useRef<JobSearchPanelHandle>(null);
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
      // A filter change (anything other than a page move) resets every list's
      // pagination so each starts from page 1 against the new filters.
      const isPageMove = Object.keys(updates).some((k) =>
        k.startsWith("page_"),
      );
      if (!isPageMove) {
        params.delete("page_match");
        params.delete("page_semi");
        params.delete("page_no");
        params.delete("page_shared");
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  const privateList = useJobList("private", {
    location,
    workType,
    q,
    search: searchFilter,
    // Load the whole private set in one page; bucketing + pagination is client-side.
    page: 1,
    per: PRIVATE_FETCH,
  });
  const sharedList = useJobList("shared", {
    location,
    workType,
    q,
    // The shared catalog has no per-search association; it is hidden entirely
    // while a search filter is active, so it never receives one.
    search: null,
    page: pageShared,
    per: PER_PAGE,
  });

  // Toggle the search filter: selecting the active one clears it.
  const handleSelectSearch = useCallback(
    (id: number) => {
      setParam({ search: searchFilter === id ? "" : String(id) });
    },
    [searchFilter, setParam],
  );

  // Stable ref to the latest private reload so the poll loop (started once) always
  // calls the current version without having to re-subscribe. Written in an effect
  // rather than during render (refs must not be mutated while rendering).
  const privateReloadRef = useRef(privateList.reload);
  useEffect(() => {
    privateReloadRef.current = privateList.reload;
  });

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

  // Load recent searches on mount; resume polling if one is still running. The
  // fetch is inlined as an async IIFE so the setState lands after the await
  // (never synchronously within the effect body).
  useEffect(() => {
    let active = true;
    (async () => {
      const data = await getJobSearches().catch(() => null);
      if (!active || !data) return;
      setSearches(data);
      if (data.some((s) => s.status === "running")) startPolling();
    })();
    return () => {
      active = false;
      stopPolling();
    };
  }, [startPolling, stopPolling]);

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
      // A credential can fetch when it has a stored BYOK key, or when it's the
      // system-funded trial (active, keyless, runs on the platform key).
      setCanFetch(creds.some((c) => c.is_active && (c.has_key || c.is_trial)));
      // Prefer the JSearch credential (also the trial's provider); fall back to
      // Adzuna so users on either provider see their remaining searches.
      setUsageCredential(
        creds.find((c) => c.provider === "jsearch") ??
          creds.find((c) => c.provider === "adzuna") ??
          null,
      );
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

  // Populate the location dropdown from the full dataset (private + shared).
  useEffect(() => {
    getJobLocations()
      .then(setLocationOptions)
      .catch(() => setLocationOptions([]));
  }, []);

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

  // confirmDelete (below) calls removePosting() into the useJobList hooks, which
  // the React Compiler treats as mutating captured deps, so it cannot preserve the
  // manual memoization of this callback block - and reports the diagnostic at the
  // block's start (here). The compiler is not enabled (advisory rule only) and the
  // callbacks are correct, so the diagnostic is suppressed.
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
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

  const filterChips = useMemo(() => {
    // The recent-search run currently constraining the lists (null when none),
    // surfaced as a clear-filter button beside the work-type select.
    const activeSearch = searchFilter
      ? (searches.find((s) => s.id === searchFilter) ?? null)
      : null;
    const activeLabel = activeSearch
      ? activeSearch.query || t("recentSearchesUntitled")
      : "";
    return (
      <Card gap={12} marginBottom={20}>
        <Typography variant="body" fontWeight={600} color="var(--foreground)">
          {t("filtersTitle")}
        </Typography>
        <Box
          display="flex"
          flexDirection="row"
          gap={12}
          flexWrap="wrap"
          alignItems="flex-end"
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
          <Box display="flex" flexDirection="column">
            <Typography
              variant="label"
              color="var(--muted-foreground, #6b7280)"
            >
              {t("hideSavedFilterLabel")}
            </Typography>
            <Box display="flex" alignItems="center" height={38}>
              <Switch
                checked={hideSaved}
                onChange={(c) => setParam({ hide_saved: c ? "" : "0" })}
                aria-label={t("hideSavedFilterLabel")}
              />
            </Box>
          </Box>
          <Box styles={{ minWidth: 140 }}>
            <Select
              label={t("locationLabel")}
              value={location}
              onChange={(v) => setParam({ location: v })}
              options={[
                { value: "", label: t("locationAll") },
                ...locationOptions.map((l) => ({ value: l, label: l })),
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
          {activeSearch && (
            <Button
              text={t("clearSearchFilter", { query: activeLabel })}
              type="button"
              size="md"
              icon="/icons/close.svg"
              iconPosition="end"
              onClick={() => setParam({ search: "" })}
              kind="primary"
            />
          )}
        </Box>
      </Card>
    );
  }, [
    searchInput,
    location,
    workType,
    hideSaved,
    locationOptions,
    searchFilter,
    searches,
    t,
    setParam,
  ]);

  const byCreatedDesc = (a: JobPosting, b: JobPosting) =>
    new Date(b.created).getTime() - new Date(a.created).getTime();

  // A posting counts as saved once it has a saved application, either from the
  // server payload or from a save made in this session (savedMap).
  const isSaved = useCallback(
    (p: JobPosting) => (savedMap[p.id] ?? p.saved_application_id) != null,
    [savedMap],
  );

  // Group the loaded private postings into curated buckets, newest first within each.
  const privateBuckets = useMemo(() => {
    const groups: Record<MatchBucket, JobPosting[]> = {
      match: [],
      semi: [],
      no: [],
    };
    const source = hideSaved
      ? privateList.postings.filter((p) => !isSaved(p))
      : privateList.postings;
    for (const p of source) groups[bucketOf(p)].push(p);
    (Object.keys(groups) as MatchBucket[]).forEach((k) =>
      groups[k].sort(byCreatedDesc),
    );
    return groups;
  }, [privateList.postings, hideSaved, isSaved]);

  // While "hide saved jobs" is on, drop saved postings from the loaded shared
  // catalog page in place.
  const sharedListView = useMemo<JobListState>(() => {
    if (!hideSaved) return sharedList;
    const filtered = sharedList.postings.filter((p) => !isSaved(p));
    return { ...sharedList, postings: filtered, count: filtered.length };
  }, [sharedList, hideSaved, isSaved]);

  // Each bucket reuses JobSection. The full bucket is bucketed/filtered client-side;
  // this slices it to the requested page and reports the full length as the count so
  // JobSection renders PER_PAGE cards and computes its own page total.
  const bucketSection = (
    postings: JobPosting[],
    page: number,
  ): JobListState => {
    const start = (page - 1) * PER_PAGE;
    return {
      postings: postings.slice(start, start + PER_PAGE),
      count: postings.length,
      loading: false,
      error: false,
      reload: privateList.reload,
      removePosting: privateList.removePosting,
    };
  };

  // One spinner on the very first load (both lists pending, no data yet);
  // afterwards each section manages its own loading state for page moves.
  const initialLoading =
    privateList.loading &&
    sharedList.loading &&
    privateList.postings.length === 0 &&
    sharedList.postings.length === 0;
  // Counts after the (client-side) "hide saved jobs" filter has been applied.
  const privateVisible =
    privateBuckets.match.length +
    privateBuckets.semi.length +
    privateBuckets.no.length;
  const sharedVisible = sharedListView.postings.length;
  // While a search filter is active the shared list is hidden, so the empty
  // state hinges on the (filtered) private list alone.
  const bothEmpty = searchFilter
    ? !privateList.loading && !privateList.error && privateVisible === 0
    : !privateList.loading &&
      !sharedList.loading &&
      !privateList.error &&
      !sharedList.error &&
      privateVisible === 0 &&
      sharedVisible === 0;

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
              kind="primary"
              iconSize="16px"
              onClick={() => setRefineOpen(true)}
              icon="/icons/filter.svg"
              iconPosition="end"
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
              icon="/icons/search.svg"
              iconPosition="end"
            />
          </Box>
        )}
      </Box>

      <JobSearchesCard
        searches={searches}
        selectedSearchId={searchFilter}
        onSelect={handleSelectSearch}
        usageCredential={usageCredential}
      />

      {filterChips}

      <Box
        display="flex"
        alignItems="center"
        gap={8}
        marginBottom={20}
        marginTop={-8}
      >
        <Box
          width={28}
          height={0}
          styles={{ borderTop: "3px solid var(--success, #16a34a)" }}
        />
        <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
          {t("savedLegend")}
        </Typography>
      </Box>

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
                kind="primary"
                onClick={privateList.reload}
              />
            </Box>
          ) : (
            <>
              {(
                [
                  ["match", t("bucketMatch"), pageMatch, "page_match"],
                  ["semi", t("bucketSemi"), pageSemi, "page_semi"],
                  ["no", t("bucketNo"), pageNo, "page_no"],
                ] as Array<[MatchBucket, string, number, string]>
              ).map(([bucket, title, page, key]) => (
                <JobSection
                  key={bucket}
                  title={title}
                  list={bucketSection(privateBuckets[bucket], page)}
                  page={page}
                  onPageChange={(p) => setParam({ [key]: String(p) })}
                  onSave={handleSave}
                  onDelete={handleDelete}
                  savingId={savingId}
                  deletingId={deletingId}
                  savedMap={savedMap}
                  isStaff={isStaff}
                />
              ))}
            </>
          )}
          {/* A search run owns only private postings, so hide the shared
              catalog entirely while filtering by a specific search. */}
          {!searchFilter && (
            <JobSection
              title={t("sharedListTitle")}
              list={sharedListView}
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
          okCallback={() => {
            void (async () => {
              const ok = await jobSearchPanelRef.current?.save();
              setRefineOpen(false);
              showToast(
                ok
                  ? tProfile("jobSearchPrefsSaved")
                  : tProfile("jobSearchPrefsError"),
                ok ? "success" : "error",
              );
            })();
          }}
          cancelCallback={() => setRefineOpen(false)}
          panelMaxWidth="640px"
        >
          <JobSearchPanel
            ref={jobSearchPanelRef}
            hideSaveButton
            showEditProfile
          />
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

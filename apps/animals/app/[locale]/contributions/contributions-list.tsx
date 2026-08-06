"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useFormatter, useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Card } from "@repo/ui/core-elements/card";
import { Grid } from "@repo/ui/core-elements/grid";
import { Spinner } from "@repo/ui/core-elements/spinner";
import { Typography } from "@repo/ui/core-elements/typography";
import { ContributionStatusBadge } from "@/components/contribute/contribution-status-badge";
import { firstErrorMessage } from "@/lib/contribute";
import {
  listContributions,
  TYPE_FOR_KIND,
  type ContributionCard,
  type ContributionStatus,
  type ContributionType,
} from "@/lib/contributions";
import { localized } from "@/lib/i18n-field";
import { isPlaceType } from "@/lib/place-types";
import "./contributions-list.css";

/**
 * The grid of everything this account has filed.
 *
 * The card is the species grid's card in shape - a 4:3 photograph, then a name
 * and a couple of quiet lines - because a contributor scanning their own
 * submissions is doing the same thing as a reader scanning a category, and two
 * different card designs for one site would be worse than one shared one. What
 * it adds is the two things only this page knows: the **status badge** over the
 * photograph, and a **type tag**, since this is the one grid in the app that
 * mixes species, places and journal entries in a single list.
 *
 * **Pagination is "load more", not a numbered bar.** A page bar is right for the
 * catalog, where a reader jumps around a stable, shared ordering; this list is
 * one person's own history in one order, read from the top, and its length is
 * whatever they happen to have filed.
 */

const PAGE_SIZE = 24;

/** The filter row's options. `null` is "everything", and leads. */
const TYPE_FILTERS: (ContributionType | null)[] = [
  null,
  "sightings",
  "species",
  "locations",
];
const STATUS_FILTERS: (ContributionStatus | null)[] = [
  null,
  "pending",
  "in_review",
  "published",
];

interface Props {
  locale: string;
}

export function ContributionsList({ locale }: Props) {
  const t = useTranslations("Contributions");

  const [type, setType] = useState<ContributionType | null>(null);
  const [status, setStatus] = useState<ContributionStatus | null>(null);
  const [rows, setRows] = useState<ContributionCard[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The first page, re-read whenever a filter changes.
   *
   * ⚠ **Nothing is set synchronously in the effect body** - the spinner is
   * raised by the filter handlers below instead, which is both what
   * `react-hooks/set-state-in-effect` asks for and the more honest description
   * of what happens: pressing a filter is the event that starts the load, and
   * the effect is only the fetch it triggers. `cancelled` is what stops a slow
   * response for a filter the reader has already moved off from overwriting a
   * newer one.
   */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const page = await listContributions({
          ...(type ? { type } : {}),
          ...(status ? { status } : {}),
          limit: PAGE_SIZE,
          offset: 0,
        });
        if (cancelled) return;
        setCount(page.count);
        // Replaced, never appended: this is always offset 0, so a filter change
        // must not leave the previous filter's rows on screen beneath it.
        setRows(page.results);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(firstErrorMessage(err) ?? t("loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [t, type, status]);

  /** The next page, appended. An event handler, so it owns its own spinner. */
  const loadMore = async () => {
    setLoadingMore(true);
    setError(null);
    try {
      const page = await listContributions({
        ...(type ? { type } : {}),
        ...(status ? { status } : {}),
        limit: PAGE_SIZE,
        offset: rows.length,
      });
      setCount(page.count);
      setRows((current) => [...current, ...page.results]);
    } catch (err) {
      setError(firstErrorMessage(err) ?? t("loadFailed"));
    } finally {
      setLoadingMore(false);
    }
  };

  /**
   * Changing a filter raises the spinner *here*, in the handler, rather than in
   * the effect that follows - see the effect's note.
   */
  const changeType = (value: ContributionType | null) => {
    setLoading(true);
    setType(value);
  };
  const changeStatus = (value: ContributionStatus | null) => {
    setLoading(true);
    setStatus(value);
  };

  if (loading) {
    return (
      <Box paddingY={48} justifyContent="center">
        <Spinner size={28} label={t("loading")} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={20}>
      <Box flexDirection="column" gap={10}>
        <FilterRow
          label={t("filterType")}
          options={TYPE_FILTERS.map((value) => ({
            value,
            label: value ? t(`type_${value}`) : t("filterAll"),
          }))}
          active={type}
          onSelect={changeType}
        />
        <FilterRow
          label={t("filterStatus")}
          options={STATUS_FILTERS.map((value) => ({
            value,
            label: value ? t(`status_${value}`) : t("filterAll"),
          }))}
          active={status}
          onSelect={changeStatus}
        />
      </Box>

      {error && (
        <Typography variant="body" color="var(--error, #ef4444)">
          {error}
        </Typography>
      )}

      {rows.length === 0 ? (
        <EmptyState filtered={type !== null || status !== null} />
      ) : (
        <>
          <Grid container spacing={2}>
            {rows.map((row) => (
              <Grid
                key={`${row.type}-${row.id}`}
                size={{ xs: 6, sm: 4, md: 3 }}
              >
                <ContributionTile row={row} locale={locale} />
              </Grid>
            ))}
          </Grid>

          {rows.length < count && (
            <Box justifyContent="center" paddingTop={8}>
              <Button
                text={t("loadMore")}
                size="lg"
                isLoading={loadingMore}
                disabled={loadingMore}
                onClick={() => void loadMore()}
              />
            </Box>
          )}

          <Typography
            variant="caption"
            color="var(--foreground-muted, #6b7280)"
            textAlign="center"
          >
            {t("showing", { shown: rows.length, total: count })}
          </Typography>
        </>
      )}
    </Box>
  );
}

/** One row of filter chips. */
function FilterRow<T extends string>({
  label,
  options,
  active,
  onSelect,
}: {
  label: string;
  options: { value: T | null; label: string }[];
  active: T | null;
  onSelect: (value: T | null) => void;
}) {
  return (
    <Box alignItems="center" gap={8} flexWrap="wrap">
      <Typography variant="label" fontWeight={700} color="var(--foreground-muted, #6b7280)">
        {label}
      </Typography>
      {options.map((option) => {
        const isActive = option.value === active;
        return (
          <Button
            key={option.value ?? "all"}
            text={option.label}
            size="sm"
            kind={isActive ? "primary" : undefined}
            aria-pressed={isActive}
            onClick={() => onSelect(option.value)}
          />
        );
      })}
    </Box>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  const t = useTranslations("Contributions");

  return (
    <Card gap={16} padding={24} maxWidth={520}>
      <Typography as="h2" variant="h3" fontWeight={700}>
        {filtered ? t("emptyFilteredTitle") : t("emptyTitle")}
      </Typography>
      <Typography variant="body" color="var(--foreground-muted, #6b7280)">
        {filtered ? t("emptyFiltered") : t("empty")}
      </Typography>
      {/* Only on the genuinely-empty case: a contributor whose filter matched
          nothing has records, and pointing them at the catalog to file another
          would be answering a question they did not ask. */}
      {!filtered && (
        <Box>
          <Button text={t("emptyAction")} href="/" kind="primary" size="lg" />
        </Box>
      )}
    </Card>
  );
}

function ContributionTile({
  row,
  locale,
}: {
  row: ContributionCard;
  locale: string;
}) {
  const t = useTranslations("Contributions");
  const tPlaceTypes = useTranslations("PlaceTypes");
  const format = useFormatter();

  const name = localized(row, "name", locale) ?? row.slug;
  const type = TYPE_FOR_KIND[row.type];

  // The one quiet line under the name, and it is a different fact per type -
  // which species and where for an entry, the binomial for a proposal, the kind
  // of place for a place. All three answer "which of my records is this?".
  const subtitle =
    row.type === "sighting"
      ? [
          localized(
            { name: row.species_name, en_name: row.species_en_name },
            "name",
            locale,
          ),
          localized(
            { name: row.location_name, en_name: row.location_en_name },
            "name",
            locale,
          ),
        ]
          .filter(Boolean)
          .join(" · ")
      : row.type === "species"
        ? (row.scientific_name ??
          localized(
            { name: row.category_name, en_name: row.category_en_name },
            "name",
            locale,
          ))
        : isPlaceType(row.place_type)
          ? tPlaceTypes(row.place_type)
          : null;

  return (
    <Card
      href={`/contributions/${type}/${row.id}`}
      prefetch
      className="contribution-card"
      padding={0}
      height="100%"
      color="inherit"
      styles={{ textDecoration: "none" }}
    >
      <Box
        width="100%"
        alignItems="center"
        justifyContent="center"
        backgroundColor="var(--surface-1, #e5e7eb)"
        styles={{
          position: "relative",
          overflow: "hidden",
          aspectRatio: "4 / 3",
        }}
      >
        {row.image ? (
          <Image
            fill
            src={row.image}
            alt={name}
            sizes="(min-width: 900px) 25vw, 50vw"
            className="contribution-card__image"
            style={{ objectFit: "cover" }}
          />
        ) : (
          // A place may be filed with no photograph at all, so this is a real
          // state rather than a defensive branch. `as="span"`: the variant would
          // otherwise put a bare letter into the page's heading outline.
          <Typography
            as="span"
            variant="h2"
            fontWeight={700}
            color="var(--accent)"
            aria-hidden
          >
            {name.charAt(0).toUpperCase()}
          </Typography>
        )}

        <Box styles={{ position: "absolute", top: 10, left: 10, zIndex: 1 }}>
          <ContributionStatusBadge status={row.status} translucent />
        </Box>
      </Box>

      <Box flexDirection="column" gap={6} padding={14} flexGrow={1}>
        <Typography
          variant="label"
          fontWeight={700}
          color="var(--foreground-muted, #6b7280)"
          styles={{ letterSpacing: "0.06em", textTransform: "uppercase" }}
        >
          {t(`kind_${row.type}`)}
        </Typography>

        <Typography as="h3" variant="h3" fontWeight={700}>
          {name}
        </Typography>

        {subtitle && (
          <Typography
            variant="caption"
            color="var(--foreground-muted, #6b7280)"
            styles={{
              display: "-webkit-box",
              WebkitLineClamp: "2",
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {subtitle}
          </Typography>
        )}

        <Typography
          variant="caption"
          color="var(--foreground-muted, #6b7280)"
          marginTop="auto"
          paddingTop={6}
        >
          {/* A sighting is dated by the outing; the two catalog records have no
              date of their own, so they read by when they were filed. */}
          {row.date
            ? formatDay(row.date, format)
            : t("filedOn", { date: formatDay(row.created, format) })}
        </Typography>
      </Box>
    </Card>
  );
}

type Formatter = ReturnType<typeof useFormatter>;

/**
 * The API publishes a bare calendar day (`YYYY-MM-DD`) for a sighting and a full
 * timestamp for `created`. A bare day parsed as-is is UTC midnight, which renders
 * as the *previous* day for any visitor west of Greenwich - so it is anchored at
 * local noon, which no timezone can push across a date boundary. (The same
 * treatment `species-grid.tsx` gives a `last_seen`.)
 */
function formatDay(day: string, format: Formatter): string {
  const parsed = new Date(day.length === 10 ? `${day}T12:00:00` : day);
  if (Number.isNaN(parsed.getTime())) return day;
  return format.dateTime(parsed, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

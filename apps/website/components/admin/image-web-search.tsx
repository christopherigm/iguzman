"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { TextInput } from "@repo/ui/core-elements/text-input";
import {
  AdminApiError,
  fetchStockImage,
  searchStockImages,
  type StockImageFile,
  type StockImageResult,
} from "@/lib/admin-api";
import "./image-web-search.css";

type Props = {
  /**
   * Prefills the query with the record's own name. It keeps following the name
   * field until the operator edits the query themselves - a search for "queso
   * Oaxaca" is often better than the row's own label, which is the whole reason
   * this is an editable box rather than a button.
   */
  defaultQuery: string;
  /** The photos picked so far. Owned by the form - they save with it. */
  value: StockImageFile[];
  onChange: (picked: StockImageFile[]) => void;
  /**
   * Left **undefined** for a single-image field, where a pick replaces whatever
   * was picked before - exactly as re-uploading a file would.
   *
   * A **number** turns the picker into a gallery one: picks append until that
   * many slots are used up. A form passes the slots its uploader has left over,
   * not the gallery's total size, so the picker stops offering photos there is
   * nowhere to put - including `0`, which says so out loud rather than letting
   * an operator pick something the save would silently drop.
   */
  slots?: number;
};

const keyOf = (hit: { bank: string; bank_id: string }) =>
  `${hit.bank}:${hit.bank_id}`;

/**
 * "Find an image" - searches the free stock banks (Pexels, then Pixabay) for a
 * photo and lets the operator set the record's image from the results.
 *
 * The banks are already how a `/seed-site` run fills a new site's photography;
 * this is the same source, reached from the CMS, for the record an operator is
 * looking at. Both calls go through website-api, which holds the keys - the same
 * split the LLM and Stripe calls make, so no bank credential reaches this app or
 * the browser.
 *
 * ⚠ **A picked photo carries a credit and the credit travels with it.** Both
 * banks' *API* terms require attribution even though their content licences
 * waive it, and the API clears any stored credit on every upload - so the chosen
 * file and its `attribution` / `attribution_url` are saved together by the
 * parent form, never separately (`stockImageFields` is that payload fragment).
 * `System.stock_image_count` is what then puts the line in the storefront
 * footer, and takes it away again once the customer has replaced the photo with
 * their own.
 */
export function ImageWebSearch({
  defaultQuery,
  value,
  onChange,
  slots,
}: Props) {
  const t = useTranslations("Admin");
  const gallery = slots !== undefined;
  const max = slots ?? 1;

  // null until the operator types: the query follows the name field until then.
  const [draft, setDraft] = useState<string | null>(null);
  const query = draft ?? defaultQuery;

  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<StockImageResult[] | null>(null);

  const handleSearch = async () => {
    const term = query.trim();
    if (!term) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const { results: found } = await searchStockImages({ query: term });
      setResults(found);
    } catch (e) {
      // The one failure an operator can act on is a missing bank key, so it says
      // so instead of "try again" - nothing here will succeed until it is set.
      const noBank =
        e instanceof AdminApiError && e.data?.code === "NO_IMAGE_BANK";
      setError(noBank ? t("imageSearchNoBank") : t("imageSearchError"));
    } finally {
      setLoading(false);
    }
  };

  const handlePick = async (hit: StockImageResult) => {
    const key = keyOf(hit);
    // A second press on a picked tile takes it back, which is the only way to
    // free a slot in a full gallery without leaving the search behind.
    const already = value.findIndex((picked) => keyOf(picked) === key);
    if (already >= 0) {
      onChange(value.filter((_, i) => i !== already));
      return;
    }
    if (gallery && value.length >= max) return;
    setPicking(key);
    setError(null);
    try {
      // The file itself is downloaded by the API, addressed by bank + id - the
      // browser never fetches it, and never names the credit that comes with it.
      const file = await fetchStockImage({
        bank: hit.bank,
        bank_id: hit.bank_id,
      });
      onChange(gallery ? [...value, file] : [file]);
    } catch {
      setError(t("imageSearchPickError"));
    } finally {
      setPicking(null);
    }
  };

  const full = gallery && value.length >= max;

  return (
    <Box flexDirection="column" gap={10} paddingTop={8}>
      <Typography variant="label" fontWeight={700} color="var(--foreground)">
        {t("imageSearchTitle")}
      </Typography>
      <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
        {gallery ? t("imageSearchHintGallery") : t("imageSearchHint")}
      </Typography>

      <Box display="flex" alignItems="center" gap={12} flexWrap="wrap">
        <TextInput
          value={query}
          onChange={setDraft}
          label={t("imageSearchQuery")}
          minWidth={0}
          styles={{ flex: "1 1 220px" }}
          onKeyDown={(e) => {
            // This sits inside the record's own <form>: without this, Enter in
            // the query box saves the record instead of running the search.
            if (e.key !== "Enter") return;
            e.preventDefault();
            void handleSearch();
          }}
        />
        <Button
          text={loading ? t("imageSearchSearching") : t("imageSearchWeb")}
          icon="/icons/search.svg"
          iconSize="16px"
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          size="md"
        />
      </Box>

      {error && (
        <Typography variant="caption" color="#e53935">
          {error}
        </Typography>
      )}

      {results?.length === 0 && (
        <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
          {t("imageSearchNone")}
        </Typography>
      )}

      {full && (
        <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
          {t("imageSearchFull")}
        </Typography>
      )}

      {results && results.length > 0 && (
        <Box
          display="grid"
          gap={8}
          styles={{
            gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
          }}
        >
          {results.map((hit) => {
            const key = keyOf(hit);
            const position = value.findIndex((p) => keyOf(p) === key);
            const isSelected = position >= 0;
            const isPicking = key === picking;
            return (
              <button
                key={key}
                type="button"
                className={`iws__tile${isSelected ? " iws__tile--selected" : ""}`}
                onClick={() => handlePick(hit)}
                disabled={picking !== null || (full && !isSelected)}
                aria-pressed={isSelected}
                aria-label={hit.alt || hit.attribution}
                title={hit.alt || hit.attribution}
              >
                <Image
                  fill
                  src={hit.thumbnail}
                  alt={hit.alt || hit.attribution}
                  sizes="128px"
                  style={{ objectFit: "cover" }}
                  unoptimized
                />
                {(isSelected || isPicking) && (
                  <span className="iws__badge" aria-hidden="true">
                    {/* In a gallery the badge is the photo's place in the queue,
                        so the order they will be added in is visible before the
                        save that adds them. */}
                    {isPicking ? "…" : gallery ? position + 1 : "✓"}
                  </span>
                )}
              </button>
            );
          })}
        </Box>
      )}

      {value.length > 0 && (
        <Box
          flexDirection="column"
          gap={8}
          padding="10px 12px"
          borderRadius={8}
          border="1px solid color-mix(in srgb, var(--accent, #06b6d4) 30%, transparent)"
          backgroundColor="color-mix(in srgb, var(--accent, #06b6d4) 5%, transparent)"
        >
          <Typography variant="label" color="var(--foreground)">
            {gallery
              ? t("imageSearchSelectedCount", { count: value.length })
              : t("imageSearchSelected")}
          </Typography>
          {value.map((picked, index) => (
            <Box
              key={keyOf(picked)}
              display="flex"
              alignItems="center"
              gap={12}
              flexWrap="wrap"
            >
              {/* The picked photo itself, so the choice is still visible after a
                  second search has replaced the grid it was picked from. */}
              <Box
                width={48}
                height={48}
                borderRadius={8}
                styles={{
                  position: "relative",
                  overflow: "hidden",
                  flex: "0 0 auto",
                }}
              >
                <Image
                  fill
                  src={picked.image}
                  alt={picked.alt || picked.attribution}
                  sizes="48px"
                  style={{ objectFit: "cover" }}
                  unoptimized
                />
              </Box>
              {/* The credit is shown, not hidden: it is what the site will print
                  in its footer for as long as this photo is on the page. */}
              <Typography
                variant="caption"
                color="var(--muted-foreground, #6b7280)"
                styles={{ flex: "1 1 180px" }}
              >
                {picked.attribution}
              </Typography>
              <Button
                text={t("imageSearchClear")}
                onClick={() => onChange(value.filter((_, i) => i !== index))}
                size="md"
              />
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

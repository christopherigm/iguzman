import { TvButton } from "@repo/ui-tv/tv-button";
import { useT } from "@/i18n/provider";
import "./tv-pagination.css";

type Props = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

type PageItem = number | "ellipsis-start" | "ellipsis-end";

// Ported from apps/cinelog's MoviePagination: first page, a window around the
// current page, the last page, with ellipses bridging the gaps.
function getPageItems(current: number, total: number): PageItem[] {
  const items: PageItem[] = [1];

  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);

  if (left > 2) items.push("ellipsis-start");
  for (let i = left; i <= right; i++) items.push(i);
  if (right < total - 1) items.push("ellipsis-end");
  if (total > 1) items.push(total);

  return items;
}

/** D-pad-navigable numbered pagination rendered below the catalog grid. */
export function TvPagination({ page, totalPages, onPageChange }: Props) {
  const { t } = useT();

  if (totalPages <= 1) return null;

  return (
    <div className="tv-pagination">
      {page > 1 && (
        <TvButton onPress={() => onPageChange(page - 1)}>
          {t("previousPage")}
        </TvButton>
      )}

      {getPageItems(page, totalPages).map((item) =>
        typeof item === "number" ? (
          <TvButton
            key={item}
            className={
              item === page ? "tv-pagination__page--active" : undefined
            }
            onPress={() => onPageChange(item)}
          >
            {item}
          </TvButton>
        ) : (
          <span key={item} className="tv-pagination__ellipsis">
            …
          </span>
        ),
      )}

      {page < totalPages && (
        <TvButton onPress={() => onPageChange(page + 1)}>
          {t("nextPage")}
        </TvButton>
      )}
    </div>
  );
}

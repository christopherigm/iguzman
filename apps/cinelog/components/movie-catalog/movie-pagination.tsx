"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";

type Props = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

type PageItem = number | "ellipsis-start" | "ellipsis-end";

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

export function MoviePagination({ page, totalPages, onPageChange }: Props) {
  const t = useTranslations("CatalogPage");

  if (totalPages <= 1) return null;

  return (
    <Box
      role="navigation"
      aria-label={t("paginationLabel")}
      display="flex"
      justifyContent="center"
      alignItems="center"
      gap={4}
      flexWrap="wrap"
    >
      <Button
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        {t("previousPage")}
      </Button>

      {getPageItems(page, totalPages).map((item) =>
        typeof item === "number" ? (
          <Button
            key={item}
            size="sm"
            aria-pressed={item === page}
            onClick={() => onPageChange(item)}
            backgroundColor={item === page ? "var(--accent)" : undefined}
            color={
              item === page ? "var(--accent-foreground, #ffffff)" : undefined
            }
          >
            {item}
          </Button>
        ) : (
          <Typography
            key={item}
            as="span"
            variant="body-sm"
            aria-hidden
            padding="0 4px"
          >
            …
          </Typography>
        ),
      )}

      <Button
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        {t("nextPage")}
      </Button>
    </Box>
  );
}

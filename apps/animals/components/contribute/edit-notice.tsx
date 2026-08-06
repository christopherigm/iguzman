"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import type { ContributionStatus } from "@/lib/contributions";

/**
 * What an edit is about to do to this record, said before the Save button.
 *
 * ⚠ **The `published` case is the reason this component exists**, and it is not
 * politeness. Saving an edit to a record that is on the public site takes it
 * **off** the site until a reviewer approves the change (animals-api's
 * `ContributionUpdateSerializer.update` sets `enabled=False`) - so a contributor
 * fixing a typo on their published sighting would otherwise watch their entry
 * vanish from the journal with nothing having warned them, and reasonably
 * conclude they had deleted it.
 *
 * The other two states get a quieter line: they are already waiting, so an edit
 * changes nothing about where they stand.
 *
 * It renders in the final stage of each flow, next to the notice the filing path
 * shows there (`pendingNotice`) and in its place.
 */

interface Props {
  status: ContributionStatus;
}

export function EditNotice({ status }: Props) {
  const t = useTranslations("Contributions");
  const unpublishes = status === "published";

  return (
    <Box
      flexDirection="column"
      gap={4}
      padding={12}
      borderRadius={8}
      backgroundColor={
        unpublishes
          ? "var(--warning-surface, rgba(245, 158, 11, 0.12))"
          : "var(--surface-2, #f3f4f6)"
      }
      border={
        unpublishes
          ? "1px solid var(--warning, #f59e0b)"
          : "1px solid var(--border, #e5e7eb)"
      }
    >
      <Typography
        variant="label"
        fontWeight={700}
        color={
          unpublishes ? "var(--warning, #f59e0b)" : "var(--foreground-muted, #6b7280)"
        }
      >
        {unpublishes ? t("editWarningTitle") : t("editNoticeTitle")}
      </Typography>
      <Typography variant="body" color="var(--foreground-muted, #6b7280)">
        {unpublishes ? t("editWarning") : t("editNotice")}
      </Typography>
    </Box>
  );
}

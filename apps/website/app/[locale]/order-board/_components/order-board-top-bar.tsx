"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@repo/i18n/navigation";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Badge } from "@repo/ui/core-elements/badge";
import { Typography } from "@repo/ui/core-elements/typography";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";

interface Props {
  /** How many tickets are waiting. */
  count: number;
  muted: boolean;
  busy: boolean;
  onToggleSound: () => void;
  onRefresh: () => void;
}

/**
 * The board's own chrome: what this screen is, how many tickets are on it, and
 * the three controls that do not belong to any one ticket.
 *
 * The site navbar is not rendered on this route (see `HideOnFullScreenTool` in
 * `components/hide-on-admin.tsx`), for the same reason the till drops it - a
 * mounted tablet showing one thing has no use for a Favorites link.
 *
 * Exit is guarded by a confirmation modal, exactly as the till's is. Nothing
 * unsaved is lost here, but leaving stops the polling and the chime - so a
 * stray tap on a screen someone is cooking from is how an order goes unnoticed
 * until the customer asks about it.
 */
export function OrderBoardTopBar({
  count,
  muted,
  busy,
  onToggleSound,
  onRefresh,
}: Props) {
  const t = useTranslations("OrderBoard");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const [confirmingExit, setConfirmingExit] = useState(false);

  return (
    <Box
      className="order-board-top-bar"
      alignItems="center"
      justifyContent="space-between"
      gap={12}
      paddingX={14}
      paddingY={10}
      backgroundColor="var(--surface-2)"
    >
      <Box alignItems="center" gap={10}>
        <Typography as="h1" variant="h4" margin={0} fontWeight={700}>
          {t("title")}
        </Typography>
        <Badge
          variant="filled"
          size="md"
          // Nothing waiting is good news, not an alert - so the count only
          // wears the accent while there is something to do.
          color={count > 0 ? undefined : "var(--surface-2)"}
        >
          {t("waitingCount", { count })}
        </Badge>
      </Box>

      <Box alignItems="center" gap={8}>
        <Button
          text={muted ? t("soundOff") : t("soundOn")}
          size="md"
          aria-pressed={!muted}
          onClick={onToggleSound}
        />
        <Button
          text={t("refresh")}
          size="md"
          kind="primary"
          disabled={busy}
          onClick={onRefresh}
        />
        <Button
          text={t("exit")}
          size="md"
          kind="error"
          onClick={() => setConfirmingExit(true)}
        />
      </Box>

      {confirmingExit && (
        <ConfirmationModal
          title={t("exitConfirmTitle")}
          text={t("exitConfirmText")}
          okLabel={t("exit")}
          cancelLabel={tCommon("cancel")}
          okCallback={() => router.push("/")}
          cancelCallback={() => setConfirmingExit(false)}
        />
      )}
    </Box>
  );
}

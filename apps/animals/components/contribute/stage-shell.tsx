"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Badge } from "@repo/ui/core-elements/badge";
import { Button } from "@repo/ui/core-elements/button";
import { Card } from "@repo/ui/core-elements/card";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { Typography } from "@repo/ui/core-elements/typography";

/**
 * The chrome every stage of a contribute flow wears: where you are, what this
 * stage is for, and the two ways out of it.
 *
 * The staging is the whole design brief - a reader filing their first sighting
 * meets three short questions rather than the CMS's twenty-field form - so the
 * chrome is shared by both flows and only the *fields* differ between them. What
 * it owns:
 *
 * - **A count, not a named stepper.** "2 of 3" plus this stage's own title, rather
 *   than a rail of every stage's name: on a phone that rail either wraps to three
 *   lines or truncates to three ellipses, and it is telling a reader about stages
 *   they cannot navigate to anyway.
 * - **Next is the primary action and it is on the right**, Back is quiet and on the
 *   left, on every stage. A flow whose buttons move between stages is a flow that
 *   makes people mis-click.
 * - **Nothing here submits.** The final stage passes its own submit handler as
 *   `onNext` with `nextLabel` set to "Publish"; this component has no idea which
 *   stage is last beyond the number it is told.
 */

interface Props {
  title: string;
  /** One sentence on what this stage is asking for, and why. */
  description?: string;
  current: number;
  total: number;
  /** Omitted on the first stage - there is nowhere to go back to. */
  onBack?: () => void;
  onNext: () => void;
  /** Overrides "Next" on the last stage ("Submit for review"). */
  nextLabel?: string;
  /** Blocks the primary action while the stage's own requirements are unmet. */
  nextDisabled?: boolean;
  /** Spins the primary action and blocks both while a submission is in flight. */
  busy?: boolean;
  children: ReactNode;
}

export function StageShell({
  title,
  description,
  current,
  total,
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  busy,
  children,
}: Props) {
  const t = useTranslations("Contribute");

  return (
    <Card gap={20} padding={20}>
      <Box flexDirection="column" gap={10}>
        <Box alignItems="center" gap={10} flexWrap="wrap">
          <Badge variant="subtle" size="sm">
            {t("stageOf", { current, total })}
          </Badge>
          <Typography as="h2" variant="h3" fontWeight={700}>
            {title}
          </Typography>
        </Box>

        <ProgressBar value={(current / total) * 100} size={4} />

        {description && (
          <Typography variant="body" color="var(--foreground-muted, #6b7280)">
            {description}
          </Typography>
        )}
      </Box>

      <Box flexDirection="column" gap={16}>
        {children}
      </Box>

      <Box
        justifyContent={onBack ? "space-between" : "flex-end"}
        alignItems="center"
        gap={10}
        flexWrap="wrap"
      >
        {onBack && (
          <Button text={t("back")} size="lg" disabled={busy} onClick={onBack} />
        )}
        <Button
          text={nextLabel ?? t("next")}
          kind="primary"
          size="lg"
          disabled={nextDisabled || busy}
          onClick={onNext}
          isLoading={busy}
        />
      </Box>
    </Card>
  );
}

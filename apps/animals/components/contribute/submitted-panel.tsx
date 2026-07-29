"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Card } from "@repo/ui/core-elements/card";
import { Icon } from "@repo/ui/core-elements/icon";
import { Typography } from "@repo/ui/core-elements/typography";

/**
 * The end of both flows: what happened, and what happens next.
 *
 * It says **pending review** rather than "published", because that is what the API
 * did - a contribution lands `enabled=false` and joins the site when an
 * administrator enables it. A confirmation that implied otherwise would send a
 * contributor looking for an entry that is deliberately invisible, and they would
 * reasonably conclude the submission failed.
 *
 * There is no link to the new record, and there cannot be: its public page 404s for
 * everyone until it is approved. The two ways on are back where the reader came
 * from, and filing another - which is the one a contributor who has just come back
 * from an outing actually wants.
 */

interface Props {
  /** What was submitted - "Species proposed" / "Sighting filed". */
  title: string;
  /** "Add another" - resets the flow to its first stage, so it names the record. */
  againLabel: string;
  onAgain: () => void;
  /** Where the reader came from: the category or the sighting the FAB sat on. */
  doneLabel: string;
  doneHref: string;
}

export function SubmittedPanel({
  title,
  againLabel,
  onAgain,
  doneLabel,
  doneHref,
}: Props) {
  const t = useTranslations("Contribute");

  return (
    <Card gap={16} padding={24} maxWidth={520}>
      <Box alignItems="center" gap={12}>
        <Icon
          icon="/icons/add.svg"
          size={28}
          color="#fff"
          backgroundColor="var(--success, #16a34a)"
          backgroundShape="circle"
        />
        <Typography as="h2" variant="h3" fontWeight={700}>
          {title}
        </Typography>
      </Box>

      <Typography variant="body" color="var(--foreground-muted, #6b7280)">
        {t("submittedDescription")}
      </Typography>

      <Box alignItems="center" gap={10} flexWrap="wrap">
        <Button
          text={againLabel}
          icon="/icons/add.svg"
          kind="primary"
          size="lg"
          onClick={onAgain}
        />
        <Button text={doneLabel} href={doneHref} size="lg" />
      </Box>
    </Card>
  );
}

"use client";

import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";

interface Props {
  title: string;
  exitLabel: string;
  count: number;
  basketLabel: string;
  onOpenBasket: () => void;
}

/**
 * The POS's own chrome: a slim bar with the screen's name, the way out, and -
 * on xs, where the basket is a sheet - the count of what is rung up.
 *
 * The site navbar is deliberately not rendered on this route (see `HideOnPos` in
 * `components/hide-on-admin.tsx`). A till is a full-screen single-purpose tool
 * and the last thing an associate needs mid-sale is a Favorites link; the one
 * affordance kept is the way back to the site.
 */
export function PosTopBar({
  title,
  exitLabel,
  count,
  basketLabel,
  onOpenBasket,
}: Props) {
  return (
    <Box
      className="pos-top-bar"
      alignItems="center"
      justifyContent="space-between"
      gap={12}
      paddingX={14}
      paddingY={10}
      backgroundColor="var(--surface-2)"
    >
      <Typography as="h1" variant="h4" margin={0} fontWeight={700}>
        {title}
      </Typography>

      <Box alignItems="center" gap={8}>
        {count > 0 && (
          <Box className="pos-top-bar__basket">
            <Button
              text={basketLabel}
              size="md"
              onClick={onOpenBasket}
              aria-label={basketLabel}
            />
          </Box>
        )}
        {count > 0 && (
          <Box className="pos-top-bar__count">
            <Badge variant="filled" size="md">
              {count}
            </Badge>
          </Box>
        )}
        <Button text={exitLabel} href="/" size="md" />
      </Box>
    </Box>
  );
}

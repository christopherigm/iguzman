import { getLocale, getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { PlaceMap } from "@/components/place-map";
import type { BookingLocation as BookingLocationData } from "@/lib/booking-shared";
import { directionsHref } from "@/lib/maps";

interface BookingLocationProps {
  location: BookingLocationData;
  /** The branch's name, for the pin's accessible label. May be empty. */
  name: string;
  /**
   * The tenant's brandmark, worn by the pin - not its logo: the pin's head is a
   * 34 px circle that crops what it is given.
   */
  pinIcon?: string | null;
}

/**
 * Where the appointment happens, under the order's lines.
 *
 * **A live map, not the stored screenshot.** `Branch.map_image` exists for the
 * confirmation email, which cannot draw one; a web page can, so this gets the
 * same `PlaceMap` every other surface on the site draws - pannable, zoomable,
 * and never stale against a pin the tenant has since moved.
 *
 * **The Directions button is the point of the block**, and it is deliberately
 * not gated on anything the map is gated on: it is built from the coordinates,
 * so it works whether or not the tiles load and whether or not anyone ever took
 * a screenshot.
 *
 * The caller decides *whether* there is a location at all - `branch_location` is
 * null for an on-premises booking, an unpinned branch and a deleted one alike
 * (see `BookingLocation` in `lib/booking-shared.ts`).
 */
export async function BookingLocation({
  location,
  name,
  pinIcon = null,
}: BookingLocationProps) {
  const [t, locale] = await Promise.all([getTranslations("Orders"), getLocale()]);

  // The page's own language first, then whichever version the tenant actually
  // wrote - the same precedence every other bilingual field here follows.
  const locationDetails =
    (locale === "en"
      ? location.en_location_details
      : location.location_details) ??
    location.location_details ??
    location.en_location_details;

  return (
    <Card gap={12}>
      <Typography as="h2" variant="h5" margin={0} color="var(--on-surface)">
        {t("locationTitle")}
      </Typography>

      {(name || location.address) && (
        <Box flexDirection="column" gap={2}>
          {name && (
            <Typography variant="body" margin={0} color="var(--on-surface)">
              {name}
            </Typography>
          )}
          {location.address && (
            <Typography
              variant="caption"
              margin={0}
              color="var(--foreground)"
              styles={{ whiteSpace: "pre-line" }}
            >
              {location.address}
            </Typography>
          )}
        </Box>
      )}

      <PlaceMap
        latitude={Number(location.latitude)}
        longitude={Number(location.longitude)}
        title={name}
        pinIcon={pinIcon}
        height={260}
      />

      {/* Under the map rather than beside the address above it: the street name
        gets the reader to the block and this gets them through the right door,
        so it is read last, on the way out. */}
      {locationDetails && (
        <Typography
          variant="caption"
          margin={0}
          color="var(--foreground)"
          styles={{ whiteSpace: "pre-line" }}
        >
          <Typography as="span" variant="label" color="var(--muted, #757575)">
            {t("locationDetailsLabel")}
          </Typography>{" "}
          {locationDetails}
        </Typography>
      )}

      <Button
        text={t("getDirections")}
        size="md"
        kind="primary"
        href={directionsHref(location.latitude, location.longitude)}
        target="_blank"
      />
    </Card>
  );
}

export default BookingLocation;

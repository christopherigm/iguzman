"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@repo/i18n/navigation";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Select } from "@repo/ui/core-elements/select";
import type { BookingFulfillment } from "@/lib/booking-shared";

export interface BookingCtaBranch {
  id: number;
  name: string;
}

interface ServiceBookingCtaProps {
  slug: string;
  fulfillmentOptions: BookingFulfillment[];
  /** The locations this service is offered at, already filtered by the page. */
  branches: BookingCtaBranch[];
}

/**
 * The buy box of a bookable service: where to have it done, and "Book now".
 *
 * This **replaces** "Add to cart" / "Buy now" rather than sitting beside them.
 * A service sold as an appointment is not a cart line - it occupies a specific
 * hour at a specific place, which a cart has no way to hold - so offering both
 * would let a customer buy a haircut with no time attached to it.
 *
 * The picker only appears when there is a genuine choice to make: two
 * fulfillments, or one fulfillment at several branches. A single-location
 * business offering the service one way sees a bare button, which is the whole
 * reason the picker is conditional rather than always rendered with one option
 * in it.
 *
 * The selection travels to `/booking/<slug>` as search params rather than being
 * posted from here, so the choice survives a refresh, a shared link and the
 * browser's back button - the booking page re-reads it from the URL and
 * re-validates it against the same options.
 */
export function ServiceBookingCta({
  slug,
  fulfillmentOptions,
  branches,
}: ServiceBookingCtaProps) {
  const t = useTranslations("Booking");
  const router = useRouter();

  const firstFulfillment: BookingFulfillment =
    fulfillmentOptions[0] ?? "branch";
  const [fulfillment, setFulfillment] =
    useState<BookingFulfillment>(firstFulfillment);
  const [branchId, setBranchId] = useState<string>(
    branches.length > 0 ? String(branches[0]?.id) : "",
  );

  const multipleFulfillments = fulfillmentOptions.length > 1;
  // Only meaningful while the customer is having it done at a location - an
  // on-premises job happens at their address, so which branch it is staffed
  // from is not theirs to pick.
  const showBranches = fulfillment === "branch" && branches.length > 1;

  // One control when only the fulfillment varies, one when only the branch does,
  // and two when both do.
  const options = multipleFulfillments
    ? fulfillmentOptions.map((option) => ({
        value: option,
        label: t(`fulfillment_${option}`),
      }))
    : [];

  const handleBook = () => {
    const search = new URLSearchParams({ fulfillment });
    if (fulfillment === "branch" && branchId) search.set("branch", branchId);
    router.push(`/booking/${slug}?${search.toString()}`);
  };

  return (
    <Box flexDirection="column" gap={12} width="100%">
      {multipleFulfillments && (
        <Select
          label={t("whereLabel")}
          value={fulfillment}
          onChange={(v) => setFulfillment(v as BookingFulfillment)}
          options={options}
        />
      )}

      {showBranches && (
        <Select
          label={t("branchLabel")}
          value={branchId}
          onChange={setBranchId}
          options={branches.map((branch) => ({
            value: String(branch.id),
            label: branch.name,
          }))}
        />
      )}

      <Button
        text={t("bookNow")}
        kind="primary"
        size="lg"
        width="100%"
        onClick={handleBook}
      />
    </Box>
  );
}

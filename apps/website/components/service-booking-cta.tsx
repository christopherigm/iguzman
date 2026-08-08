"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@repo/i18n/navigation";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Select } from "@repo/ui/core-elements/select";
import { Typography } from "@repo/ui/core-elements/typography";
import { QuantityStepper } from "@/components/quantity-stepper";
import type { BookingFulfillment } from "@/lib/booking-shared";
import { formatPrice } from "@/lib/price";

export interface BookingCtaBranch {
  id: number;
  name: string;
}

interface ServiceBookingCtaProps {
  slug: string;
  fulfillmentOptions: BookingFulfillment[];
  /** The locations this service is offered at, already filtered by the page. */
  branches: BookingCtaBranch[];
  /** Priced per person, and one booking may cover several. */
  partyEnabled: boolean;
  partyMin: number;
  /**
   * The API's `booking_party_limit`, not the service's raw maximum.
   *
   * ⚠ **An upper bound, not a promise.** It already accounts for the biggest
   * single resource across every location, so the counter cannot offer a party
   * no boat could ever seat - but it says nothing about who is already booked,
   * and it can differ per branch. The booking page does the real filtering from
   * the availability payload; this only keeps the counter honest.
   */
  partyMax: number;
  price: string;
  currency: string;
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
  partyEnabled,
  partyMin,
  partyMax,
  price,
  currency,
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
  const [party, setParty] = useState<number>(Math.max(partyMin, 1));

  // Only worth a control when there is a range to move within. A service that
  // is per-person but takes exactly one party size is a service with a fixed
  // price, and a counter stuck on one number is a question with one answer.
  const showParty = partyEnabled && partyMax > partyMin;
  const total = (Number(price) || 0) * party;

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
    // Rides in the URL like the location does, so the choice survives a
    // refresh, a shared link and the back button - and the booking page
    // re-validates it against what the service actually accepts.
    if (partyEnabled) search.set("party", String(party));
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

      {showParty && (
        <Box
          alignItems="center"
          justifyContent="space-between"
          gap={12}
          flexWrap="wrap"
        >
          <Box flexDirection="column" gap={2}>
            <Typography as="span" variant="label" color="var(--muted, #757575)">
              {t("partyLabel")}
            </Typography>
            <Typography variant="caption" color="var(--foreground)">
              {t("partyTotal", {
                total: formatPrice(total.toFixed(2), currency),
              })}
            </Typography>
          </Box>
          <QuantityStepper
            value={party}
            onChange={setParty}
            min={partyMin}
            max={partyMax}
            decreaseLabel={t("partyDecrease")}
            increaseLabel={t("partyIncrease")}
            ariaLabel={t("partyLabel")}
          />
        </Box>
      )}

      <Button
        text={t("bookNow")}
        icon="/icons/calendar.svg"
        kind="primary"
        size="lg"
        width="100%"
        onClick={handleBook}
      />
    </Box>
  );
}

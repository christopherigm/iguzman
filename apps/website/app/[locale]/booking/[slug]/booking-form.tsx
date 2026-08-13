"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@repo/i18n/navigation";
import { Badge } from "@repo/ui/core-elements/badge";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Card } from "@repo/ui/core-elements/card";
import { Grid } from "@repo/ui/core-elements/grid";
import { Select } from "@repo/ui/core-elements/select";
import { Spinner } from "@repo/ui/core-elements/spinner";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Typography } from "@repo/ui/core-elements/typography";
import { BookingCalendar } from "@/components/booking/booking-calendar";
import { QuantityStepper } from "@/components/quantity-stepper";
import { PlaceMap } from "@/components/place-map";
import {
  BookingError,
  createBooking,
  fetchAvailability,
  formatSlotTime,
  keyFromDate,
  type AvailabilityResponse,
  type BookingFulfillment,
  type BookingPaymentOption,
} from "@/lib/booking";
import { formatPrice } from "@/lib/price";

export interface BookingFormBranch {
  id: number;
  name: string;
  address: string | null;
  /** How to find the entrance once you are there, drawn under the address. */
  locationDetails: string | null;
  /** Decimal strings from the API, or null where the tenant never pinned it. */
  latitude: string | null;
  longitude: string | null;
}

interface BookingFormProps {
  service: {
    id: number;
    slug: string;
    name: string;
    price: string;
    currency: string;
    duration: number | null;
    /** One booking may cover several people, priced per head. */
    partyEnabled: boolean;
    partyMin: number;
    /** The API's `booking_party_limit` - an upper bound across every location,
     *  not a promise about this branch on this day. */
    partyMax: number;
  };
  branches: BookingFormBranch[];
  /** The tenant's brandmark, drawn inside the location map's pin. */
  pinIcon: string | null;
  fulfillmentOptions: BookingFulfillment[];
  paymentOptions: BookingPaymentOption[];
  depositPercent: number;
  /** The signed-in customer's details, shown as a statement rather than as
   *  fields - see `readOnlyName` below. Null for a guest, who fills them in. */
  account: { name: string; email: string } | null;
}

/** How many days of availability to ask for at a time. Comfortably a month plus
 *  the overhang either side, and under the API's own 62-day cap. */
const AVAILABILITY_DAYS = 45;

/** How often an open booking page re-asks for availability. Matches the API's
 *  own 60-second cache TTL, so a poll normally costs a cache read. */
const AVAILABILITY_REFRESH_MS = 60_000;

/**
 * The booking checkout: pick where, pick when, say anything the tenant needs to
 * know, and choose how to pay.
 *
 * **Availability is never derived here.** Every date and every time on screen
 * came from `/api/booking/availability`, which runs the same engine that
 * checkout re-runs before it writes the booking. This component's job is to show
 * the answer and to stop the customer from asking a question the server has
 * already said no to - not to have an opinion of its own about opening hours.
 *
 * The selected slot is stored as the **UTC instant string the API returned**,
 * not as a local time this component reassembles from a date and a time. Every
 * hour on screen is formatted through the branch's `timezone`, so a customer
 * booking from another country sees the hour they are expected to arrive.
 */
export function BookingForm({
  service,
  branches,
  pinIcon,
  fulfillmentOptions,
  paymentOptions,
  depositPercent,
  account,
}: BookingFormProps) {
  const t = useTranslations("Booking");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Seeded from the detail page's picker, but re-validated against what this
  // service actually offers - the params are in a URL the customer can edit.
  const initialFulfillment = (() => {
    const requested = searchParams.get(
      "fulfillment",
    ) as BookingFulfillment | null;
    return requested && fulfillmentOptions.includes(requested)
      ? requested
      : (fulfillmentOptions[0] ?? "branch");
  })();
  const initialBranch = (() => {
    const requested = Number(searchParams.get("branch"));
    return branches.some((b) => b.id === requested)
      ? requested
      : (branches[0]?.id ?? null);
  })();
  // Same treatment as the two above: seeded from the detail page's counter and
  // clamped to what the service accepts, because the param is in a URL the
  // customer can edit. The API refuses (rather than clamps) a party outside the
  // range, so sending an unclamped one would fail at submit instead of here.
  const initialParty = (() => {
    if (!service.partyEnabled) return 1;
    const requested = Number(searchParams.get("party"));
    if (!Number.isFinite(requested) || requested < 1) return service.partyMin;
    return Math.max(service.partyMin, Math.min(requested, service.partyMax));
  })();

  const [fulfillment, setFulfillment] =
    useState<BookingFulfillment>(initialFulfillment);
  const [branchId, setBranchId] = useState<number | null>(initialBranch);
  const [party, setParty] = useState<number>(initialParty);
  // The customer's pick of boat/guide/room, when the tenant publishes them.
  // `null` is "any", which is both the default and the only option for the
  // overwhelming majority of tenants.
  const [resourceId, setResourceId] = useState<number | null>(null);
  const [monthStart, setMonthStart] = useState<string>(() =>
    keyFromDate(new Date()),
  );
  // The response is stored **with the request key it answered**, which is what
  // lets `loadingSlots` be derived rather than tracked: the calendar is loading
  // exactly when what we hold does not answer what we are currently asking. A
  // separate `loading` flag would have to be set synchronously inside the
  // effect, which is both a cascading render and the thing `react-hooks` warns
  // about - and it could go out of step with the data it describes.
  const [loaded, setLoaded] = useState<{
    key: string;
    response: AvailabilityResponse;
  } | null>(null);
  const [selectedDayRaw, setSelectedDay] = useState<string | null>(null);
  const [selectedSlotRaw, setSelectedSlot] = useState<string | null>(null);

  const [paymentOption, setPaymentOption] = useState<BookingPaymentOption>(
    paymentOptions[0] ?? "in_person",
  );
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [name, setName] = useState(account?.name ?? "");
  const [email, setEmail] = useState(account?.email ?? "");
  const [phone, setPhone] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // What the calendar is currently asking for. Everything about availability
  // hangs off this one string, so there is no way for the branch, the month and
  // the loaded data to be describing three different things.
  //
  // Party size and the chosen resource are part of it because they change which
  // slots come back and how many seats each reports - not a filter applied to
  // an answer computed for somebody else.
  const requestKey = `${branchId ?? "none"}|${monthStart}|${party}|${resourceId ?? "any"}`;

  // Aborts the in-flight availability request when the branch or month changes,
  // so a slow first response can never land after a faster second one and
  // repaint the previous branch's times.
  const abortRef = useRef<AbortController | null>(null);
  // Bumped to force a refetch of the *same* key - what a rejected slot needs,
  // since nothing about the request has changed but the answer has.
  const [reloadToken, setReloadToken] = useState(0);

  // Availability decays on its own for **today**: a page opened at 11:00 is
  // still offering the 13:00 at 13:05, and the customer only finds out when
  // checkout honestly refuses it. So the calendar re-asks on a timer rather than
  // filtering the list here - the API is the only thing that decides which times
  // exist, and it is the only thing that knows the branch's clock.
  //
  // A minute matches the availability payload's own TTL, so a poll never costs
  // more than a cache read. It is skipped while the tab is hidden: a booking
  // form left open in a background tab for an afternoon should not be waking up
  // to poll, and it refetches on the way back into view anyway.
  useEffect(() => {
    const revalidate = () => {
      if (document.visibilityState !== "visible") return;
      setReloadToken((n) => n + 1);
    };
    const timer = window.setInterval(revalidate, AVAILABILITY_REFRESH_MS);
    document.addEventListener("visibilitychange", revalidate);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, []);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    void (async () => {
      try {
        const data = await fetchAvailability(
          {
            service: service.id,
            branch: branchId,
            start: monthStart,
            days: AVAILABILITY_DAYS,
            party,
            resource: resourceId,
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setLoaded({ key: requestKey, response: data });
      } catch (err) {
        if (controller.signal.aborted || (err as Error).name === "AbortError")
          return;
        setError(t("errorAvailability"));
      }
    })();

    return () => controller.abort();
    // `requestKey` is derived from the four values above it, so listing them
    // all keeps the lint rule satisfied without refetching more than once.
  }, [
    service.id,
    branchId,
    monthStart,
    party,
    resourceId,
    requestKey,
    reloadToken,
    t,
  ]);

  const availability =
    loaded && loaded.key === requestKey ? loaded.response : null;
  const loadingSlots = availability === null;

  const availableDays = useMemo(
    () => new Set(Object.keys(availability?.availability ?? {})),
    [availability],
  );

  // Derived, not corrected in an effect: a day that was open for the previous
  // branch may be closed for this one, and the selection has to fall away with
  // it rather than leave a highlighted square whose slot list is empty. Doing it
  // here means there is never a render in which the two disagree.
  const selectedDay =
    selectedDayRaw && availableDays.has(selectedDayRaw) ? selectedDayRaw : null;
  const slotsForDay = selectedDay
    ? (availability?.availability[selectedDay] ?? [])
    : [];
  // Likewise for the time: a slot only counts while it is still on the list its
  // day offers. Growing the party is what makes this earn its keep - the 10:00
  // with three seats left simply stops being offered, and the selection falls
  // away with it rather than sitting highlighted and un-bookable.
  const selectedSlot =
    selectedSlotRaw && slotsForDay.some((s) => s.at === selectedSlotRaw)
      ? selectedSlotRaw
      : null;
  const timeZone = availability?.timezone ?? "UTC";

  const branch = branches.find((b) => b.id === branchId) ?? null;

  // Where the appointment happens, when there is a "where" worth drawing. Only
  // for `branch` fulfillment: with `on_premises` the tenant travels to the
  // customer, so a map of the shop would be answering a question nobody asked -
  // and pointing at the wrong address on the page where the right one is typed.
  // A branch the tenant never pinned simply gets no map, exactly as on the
  // contact page.
  const branchPin =
    fulfillment === "branch" &&
    branch &&
    branch.latitude !== null &&
    branch.longitude !== null
      ? {
          latitude: Number(branch.latitude),
          longitude: Number(branch.longitude),
          title: branch.name,
        }
      : null;

  // Published only for a `customer_selectable` pool; empty for everybody else,
  // which is what keeps the picker off the page for the ordinary tenant.
  const resourceOptions = availability?.resources ?? [];
  // The tenant's own noun for one of them ("boat", "guide"), falling back to a
  // generic word so the label never reads as a blank.
  const resourceUnit = resourceOptions[0]?.unit_label || t("resourceUnit");
  // Seat counts are worth showing once a slot can hold more than one party -
  // either because this service sells parties, or because the tenant models
  // multi-seat resources.
  const showSeatsLeft =
    service.partyEnabled || slotsForDay.some((slot) => slot.seats_left > 1);

  // The account's own name and email are **shown, not offered as fields**: the
  // booking is filed under the signed-in customer either way, so an edit here
  // could only disagree with the account it lands on. Anything that still needs
  // saying - the appointment is for someone else, a second number to try - goes
  // in "Booking details" below, which the tenant reads.
  //
  // Both are decided from the `account` prop, never from the state they seed:
  // read off the state, a signed-in customer with no name on their profile
  // would watch the field turn into text as soon as they typed into it. A guest
  // has no account to read at all, and keeps both fields.
  const readOnlyName = (account?.name ?? "").trim().length > 0;
  const readOnlyEmail = (account?.email ?? "").trim().length > 0;

  // The party multiplies the price, exactly as it multiplies the order line's
  // quantity on the API side - so the deposit and the balance follow for free.
  const price = Number(service.price) * party;
  const dueNow =
    paymentOption === "full"
      ? price
      : paymentOption === "deposit"
        ? Math.round(price * depositPercent) / 100
        : 0;
  const dueLater = price - dueNow;

  const canSubmit =
    Boolean(selectedSlot) &&
    !submitting &&
    (fulfillment !== "on_premises" || address.trim().length > 0) &&
    (email.trim().length > 0 || phone.trim().length > 0);

  const handleSubmit = async () => {
    if (!selectedSlot) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await createBooking({
        service: service.id,
        branch: fulfillment === "branch" ? branchId : branchId,
        fulfillment,
        starts_at: selectedSlot,
        party_size: party,
        resource: resourceId,
        payment_option: paymentOption,
        address: fulfillment === "on_premises" ? address.trim() : "",
        notes: notes.trim(),
        locale,
        contact: {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
        },
      });
      if (result.url) {
        // Stripe's hosted page is on another origin, so this is a full
        // navigation, not a router push.
        window.location.href = result.url;
        return;
      }
      if (result.redirect) {
        // The API returns a locale-prefixed path; `router.push` would prefix it
        // again, so this goes through the browser directly.
        window.location.href = result.redirect;
        return;
      }
      router.push(`/orders/${result.order_id}`);
    } catch (err) {
      if (err instanceof BookingError && err.code === "SLOT_UNAVAILABLE") {
        // Someone took it while this form was open. Say so, drop the selection
        // and refetch, so the customer is looking at a live calendar rather than
        // being told to try again against the same dead slot.
        setError(t("errorSlotTaken"));
        setSelectedSlot(null);
        setReloadToken((n) => n + 1);
      } else if (
        err instanceof BookingError &&
        err.code === "PAYMENTS_UNAVAILABLE"
      ) {
        setError(t("errorPaymentsUnavailable"));
      } else {
        setError(t("errorBooking"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card gap={22} width="100%" padding={22}>
      <Box flexDirection="column" gap={6}>
        <Typography as="h2" variant="h3">
          {service.name}
        </Typography>
        <Box alignItems="center" gap={10} flexWrap="wrap">
          {/* The party's total, not the unit price - it is what the customer is
            about to be charged, and the per-person figure is spelled out beside
            it rather than left to be multiplied in their head. */}
          <Typography as="span" variant="none" className="item-price">
            {formatPrice(price.toFixed(2), service.currency)}
          </Typography>
          {service.partyEnabled && (
            <Typography as="span" variant="caption" color="var(--foreground)">
              {t("partyPriceBreakdown", {
                unit: formatPrice(service.price, service.currency),
                count: party,
              })}
            </Typography>
          )}
          {service.duration && (
            <Badge variant="filled" color="var(--accent)">
              ⏱ {t("minutes", { count: service.duration })}
            </Badge>
          )}
        </Box>
      </Box>

      {/* Two columns from `sm` up: what is being booked (where and when) on the
        left, who it is for and how it is paid on the right. Below `sm` they
        stack in that same order, which is the order the form is filled in. */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Box flexDirection="column" gap={22}>
            {/* Where. Rendered only when there is a genuine choice - a
              single-location business offering one fulfillment sees neither
              control. */}
            {fulfillmentOptions.length > 1 && (
              <Select
                label={t("whereLabel")}
                value={fulfillment}
                onChange={(v) => setFulfillment(v as BookingFulfillment)}
                options={fulfillmentOptions.map((option) => ({
                  value: option,
                  label: t(`fulfillment_${option}`),
                }))}
              />
            )}

            {fulfillment === "branch" && branches.length > 1 && (
              <Select
                label={t("branchLabel")}
                value={String(branchId ?? "")}
                onChange={(v) => setBranchId(Number(v))}
                options={branches.map((b) => ({
                  value: String(b.id),
                  label: b.name,
                }))}
              />
            )}

            {/* ⚠ The branch's address is deliberately **not** here any more.
              It reads as an answer to "where?", so it belongs under the map in
              the right-hand column that draws that place - beside the location
              details, which are only useful next to it. What stays here is the
              *customer's* address, which is a question this column asks. */}
            {fulfillment === "on_premises" && (
              <TextInput
                label={t("addressLabel")}
                multirow
                rows={3}
                value={address}
                onChange={setAddress}
                helperText={t("addressHint")}
              />
            )}

            {/* How many. Above the calendar, because it decides which days and
              times the calendar may show at all - putting it below would let a
              customer pick a slot and then watch it disappear. */}
            {service.partyEnabled && service.partyMax > service.partyMin && (
              <Box flexDirection="column" gap={6}>
                <Typography as="h3" variant="h5">
                  {t("partyTitle")}
                </Typography>
                <Box
                  alignItems="center"
                  justifyContent="space-between"
                  gap={12}
                  flexWrap="wrap"
                >
                  <Typography variant="caption" color="var(--foreground)">
                    {t("partyHint")}
                  </Typography>
                  <QuantityStepper
                    value={party}
                    onChange={(next) => {
                      setParty(next);
                      // The slot is dropped rather than left to be filtered out
                      // on the next render: between the click and the new
                      // payload arriving there is a moment where the old, now
                      // possibly too-small, slot would still read as selected.
                      setSelectedSlot(null);
                    }}
                    min={service.partyMin}
                    max={service.partyMax}
                    decreaseLabel={t("partyDecrease")}
                    increaseLabel={t("partyIncrease")}
                    ariaLabel={t("partyTitle")}
                  />
                </Box>
              </Box>
            )}

            {/* Which one. Only rendered when the tenant publishes its resources
              - a `customer_selectable` pool - which is the exception, not the
              rule: a salon assigns whichever chair is free and the customer
              never hears about it. */}
            {resourceOptions.length > 0 && (
              <Select
                label={t("resourceLabel", { unit: resourceUnit })}
                value={resourceId == null ? "" : String(resourceId)}
                onChange={(v) => {
                  setResourceId(v === "" ? null : Number(v));
                  setSelectedSlot(null);
                }}
                options={[
                  {
                    value: "",
                    label: t("resourceAny", { unit: resourceUnit }),
                  },
                  ...resourceOptions.map((r) => ({
                    value: String(r.id),
                    label: r.name,
                  })),
                ]}
              />
            )}

            {/* When. */}
            <Box flexDirection="column" gap={10}>
              <Typography as="h3" variant="h5">
                {t("pickDay")}
              </Typography>
              <BookingCalendar
                availableDays={availableDays}
                value={selectedDay}
                onChange={(day) => {
                  setSelectedDay(day);
                  setSelectedSlot(null);
                }}
                onMonthChange={setMonthStart}
                lastBookableDay={availability?.last_bookable_date}
                loading={loadingSlots}
              />
              {loadingSlots && (
                <Box alignItems="center" gap={8}>
                  <Spinner size={16} />
                  <Typography variant="caption">{t("loadingSlots")}</Typography>
                </Box>
              )}
              {!loadingSlots && availableDays.size === 0 && (
                <Typography variant="body">{t("noAvailability")}</Typography>
              )}
            </Box>

            {selectedDay && (
              <Box flexDirection="column" gap={10}>
                <Typography as="h3" variant="h5">
                  {t("pickTime")}
                </Typography>
                <Box gap={8} flexWrap="wrap" alignItems="flex-start">
                  {slotsForDay.map((slot) => (
                    <Box key={slot.at} flexDirection="column" gap={2}>
                      <Button
                        text={formatSlotTime(slot.at, timeZone, locale)}
                        kind={selectedSlot === slot.at ? "primary" : undefined}
                        size="md"
                        aria-pressed={selectedSlot === slot.at}
                        onClick={() => setSelectedSlot(slot.at)}
                      />
                      {/* Only where seats are actually a scarce thing. On a
                        one-person appointment every slot has exactly one seat
                        left, and printing that on all of them says nothing. */}
                      {showSeatsLeft && (
                        <Typography
                          variant="caption"
                          color="var(--foreground)"
                          textAlign="center"
                        >
                          {t("seatsLeft", { count: slot.seats_left })}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Box>
                <Typography variant="caption" color="var(--foreground)">
                  {t("timesShownIn", { timezone: timeZone })}
                </Typography>
              </Box>
            )}
          </Box>
        </Grid>

        <Grid size={{ xs: 12, sm: 6 }}>
          <Box flexDirection="column" gap={22}>
            {/* Where it happens, at the top of the column the customer fills
              in: the location has already been chosen on the left, and this is
              the last chance to notice it is the wrong side of town before
              typing a name and paying. The same single-pin map the contact page
              and an event draw, so all three wear the tenant's own basemap and
              brandmark. */}
            {branchPin && (
              <PlaceMap
                latitude={branchPin.latitude}
                longitude={branchPin.longitude}
                title={branchPin.title}
                pinIcon={pinIcon}
                height={220}
              />
            )}

            {/* The address and then how to find the entrance, in that order and
              directly under the map: the street gets the customer to the block,
              the details get them through the right door. Both are gated on
              `branch` fulfillment for the same reason the map is - with
              `on_premises` the tenant travels to the customer - and neither is
              gated on the pin, so an unpinned location still says where it is. */}
            {fulfillment === "branch" &&
              (branch?.address || branch?.locationDetails) && (
                <Box flexDirection="column" gap={6}>
                  {branch.address && (
                    <Typography
                      variant="caption"
                      color="var(--foreground)"
                      styles={{ whiteSpace: "pre-line" }}
                    >
                      <Typography
                        as="span"
                        variant="label"
                        color="var(--muted, #757575)"
                      >
                        {t("branchAddressLabel")}
                      </Typography>{" "}
                      {branch.address}
                    </Typography>
                  )}
                  {branch.locationDetails && (
                    <Typography
                      variant="caption"
                      color="var(--foreground)"
                      styles={{ whiteSpace: "pre-line" }}
                    >
                      <Typography
                        as="span"
                        variant="label"
                        color="var(--muted, #757575)"
                      >
                        {t("locationDetailsLabel")}
                      </Typography>{" "}
                      {branch.locationDetails}
                    </Typography>
                  )}
                </Box>
              )}

            {/* Who. Read off the account where there is one; a guest fills it
              in. The phone is always a field - it is on no account. */}
            <Box flexDirection="column" gap={12}>
              <Typography as="h3" variant="h5">
                {t("contactTitle")}
              </Typography>

              {readOnlyName ? (
                <AccountDetail label={t("nameLabel")} value={name} />
              ) : (
                <TextInput
                  label={t("nameLabel")}
                  value={name}
                  onChange={setName}
                />
              )}

              {readOnlyEmail ? (
                <>
                  <AccountDetail label={t("emailLabel")} value={email} />
                  <TextInput
                    label={t("phoneLabel")}
                    format="phone"
                    value={phone}
                    onChange={setPhone}
                  />
                </>
              ) : (
                // Two fields still share a row; one field beside a line of text
                // would only leave the text floating against a taller box.
                <Box gap={12} flexWrap="wrap">
                  <TextInput
                    label={t("emailLabel")}
                    type="email"
                    value={email}
                    onChange={setEmail}
                    flex="1"
                    minWidth={200}
                  />
                  <TextInput
                    label={t("phoneLabel")}
                    format="phone"
                    value={phone}
                    onChange={setPhone}
                    flex="1"
                    minWidth={200}
                  />
                </Box>
              )}

              <Typography variant="caption" color="var(--foreground)">
                {readOnlyName || readOnlyEmail
                  ? t("contactAccountHint")
                  : t("contactHint")}
              </Typography>
            </Box>

            <TextInput
              label={t("notesLabel")}
              multirow
              rows={4}
              value={notes}
              onChange={setNotes}
              helperText={t("notesHint")}
            />

            {/* How to pay. One option is shown as a statement rather than a
              picker - a select with a single choice is a question with one
              answer. */}
            <Box flexDirection="column" gap={10}>
              <Typography as="h3" variant="h5">
                {t("paymentTitle")}
              </Typography>
              {paymentOptions.length > 1 ? (
                <Select
                  label={t("paymentLabel")}
                  value={paymentOption}
                  onChange={(v) => setPaymentOption(v as BookingPaymentOption)}
                  options={paymentOptions.map((option) => ({
                    value: option,
                    label:
                      option === "deposit"
                        ? t("payment_deposit_percent", {
                            percent: depositPercent,
                          })
                        : t(`payment_${option}`),
                  }))}
                />
              ) : (
                <Typography variant="body">
                  {paymentOption === "deposit"
                    ? t("payment_deposit_percent", { percent: depositPercent })
                    : t(`payment_${paymentOption}`)}
                </Typography>
              )}

              <Box flexDirection="column" gap={4}>
                <Typography variant="body">
                  {t("dueNow")}:{" "}
                  <strong>
                    {formatPrice(dueNow.toFixed(2), service.currency)}
                  </strong>
                </Typography>
                {dueLater > 0 && (
                  <Typography variant="body">
                    {t("dueLater")}:{" "}
                    <strong>
                      {formatPrice(dueLater.toFixed(2), service.currency)}
                    </strong>
                  </Typography>
                )}
              </Box>
            </Box>

            {error && (
              <Typography variant="body" color="var(--error, #ef4444)">
                {error}
              </Typography>
            )}

            <Box flexDirection="column" gap={8}>
              <Button
                text={
                  paymentOption === "in_person"
                    ? t("confirmBooking")
                    : t("payAndBook")
                }
                kind="primary"
                size="lg"
                width="100%"
                disabled={!canSubmit}
                isLoading={submitting}
                onClick={() => void handleSubmit()}
              />
              {!selectedSlot && (
                <Typography
                  variant="caption"
                  color="var(--foreground)"
                  textAlign="center"
                >
                  {t("pickASlotFirst")}
                </Typography>
              )}
            </Box>
          </Box>
        </Grid>
      </Grid>
    </Card>
  );
}

/**
 * One detail taken from the customer's account, laid out like the field it
 * replaces - the label in the same muted tone `TextInput` floats above a filled
 * input - so the contact block still reads as one group rather than as a form
 * with a paragraph dropped into the middle of it.
 */
function AccountDetail({ label, value }: { label: string; value: string }) {
  return (
    <Box flexDirection="column" gap={2}>
      <Typography as="span" variant="label" color="var(--muted, #757575)">
        {label}
      </Typography>
      <Typography variant="body">{value}</Typography>
    </Box>
  );
}

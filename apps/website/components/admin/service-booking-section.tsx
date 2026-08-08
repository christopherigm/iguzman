"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Switch } from "@repo/ui/core-elements/switch";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Typography } from "@repo/ui/core-elements/typography";

export interface BookingBranchOption {
  id: number;
  name: string;
  /** The branch's own seat capacity, used only for the warning below - a party
   *  bigger than every resource at a location can never be seated there. */
  bookingCapacity: number;
  /** Every resource pool at that branch, flattened for the picker. */
  pools: BookingPoolOption[];
}

export interface BookingPoolOption {
  id: number;
  name: string;
  branchId: number;
  /** The biggest single resource in the pool: the real ceiling on a party,
   *  since a party never splits across two resources. */
  largestCapacity: number;
}

interface ServiceBookingSectionProps {
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  branches: BookingBranchOption[];
  /** Branch ids this service is offered at. Empty means every branch. */
  selectedBranchIds: number[];
  onBranchesChange: (ids: number[]) => void;
  /** Pool ids this service draws on. Empty means every pool at the branch. */
  selectedPoolIds: number[];
  onPoolsChange: (ids: number[]) => void;
}

/**
 * One labelled switch row. Local to this file rather than a `@repo/ui` export:
 * it is only the section's own layout, and the package already owns the control.
 */
function SwitchRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Box alignItems="flex-start" justifyContent="space-between" gap={12}>
      <Box flexDirection="column" gap={2} flex="1" minWidth={0}>
        <Typography variant="body" fontWeight={600}>
          {label}
        </Typography>
        {hint && (
          <Typography variant="caption" color="var(--foreground)">
            {hint}
          </Typography>
        )}
      </Box>
      <Switch
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-label={label}
      />
    </Box>
  );
}

/**
 * The booking configuration block on a service's CMS page: whether the service
 * is booked at all, where it can be fulfilled, at which locations, and how the
 * customer may pay.
 *
 * Everything below the master switch is hidden while booking is off, rather
 * than disabled - a tenant that does not sell appointments should not have to
 * read past eight controls that do nothing.
 *
 * Two invariants this UI is deliberately shaped around, both of which the API
 * also enforces (see `Service.booking_payment_options` /
 * `booking_fulfillment_options`):
 *
 * - **No branches selected means every branch.** The picker says so, because
 *   the alternative reading - "no locations, so unbookable" - is what an
 *   operator would otherwise assume from an empty list.
 * - **All payment switches off means pay in person.** Shown as a note rather
 *   than by silently flipping the switch back on, so what the operator set and
 *   what the customer will see are both visible.
 * - **No pools selected means every pool at the location.** Same rule, same
 *   note, for the same reason.
 */
export function ServiceBookingSection({
  values,
  onChange,
  branches,
  selectedBranchIds,
  onBranchesChange,
  selectedPoolIds,
  onPoolsChange,
}: ServiceBookingSectionProps) {
  const t = useTranslations("AdminServiceBooking");

  const enabled = Boolean(values.booking_enabled);
  const inBranch = Boolean(values.booking_in_branch);
  const onPremises = Boolean(values.booking_on_premises);
  const payFull = Boolean(values.booking_pay_full);
  const payDeposit = Boolean(values.booking_pay_deposit);
  const payInPerson = Boolean(values.booking_pay_in_person);
  const partyEnabled = Boolean(values.booking_party_enabled);
  const partyMax = Number(values.booking_party_max) || 1;

  const noPaymentOption = !payFull && !payDeposit && !payInPerson;

  // The locations this service actually reaches - empty selection means all of
  // them, so the pool picker and the capacity warning both read from here
  // rather than from `selectedBranchIds` directly.
  const reachableBranches =
    selectedBranchIds.length === 0
      ? branches
      : branches.filter((b) => selectedBranchIds.includes(b.id));

  const reachablePools = reachableBranches.flatMap((b) => b.pools);

  // The largest party any single resource could seat, across every location this
  // service is offered at. A pool defines it where one exists; otherwise it is
  // the branch's own capacity, which is what the implicit fallback resource
  // carries. This is an upper bound and the note says so - it ignores who is
  // already booked and differs per branch.
  const seatCeiling = reachableBranches.reduce((max, branch) => {
    const pools =
      selectedPoolIds.length === 0
        ? branch.pools
        : branch.pools.filter((p) => selectedPoolIds.includes(p.id));
    const branchMax =
      pools.length > 0
        ? pools.reduce((m, p) => Math.max(m, p.largestCapacity), 0)
        : branch.bookingCapacity;
    return Math.max(max, branchMax);
  }, 0);

  // A duration of zero or blank silently becomes 60 minutes in the engine, and
  // duration is what stops one boat being booked at both 10:00 and 11:00 for a
  // four-hour tour. Worth saying out loud rather than leaving to be discovered.
  const missingDuration = enabled && !Number(values.duration);

  const toggleBranch = (id: number) => {
    onBranchesChange(
      selectedBranchIds.includes(id)
        ? selectedBranchIds.filter((b) => b !== id)
        : [...selectedBranchIds, id],
    );
  };

  const togglePool = (id: number) => {
    onPoolsChange(
      selectedPoolIds.includes(id)
        ? selectedPoolIds.filter((p) => p !== id)
        : [...selectedPoolIds, id],
    );
  };

  return (
    <Box flexDirection="column" gap={16} width="100%">
      <Box flexDirection="column" gap={4}>
        <Typography as="h3" variant="h4">
          {t("title")}
        </Typography>
        <Typography variant="body" color="var(--foreground)">
          {t("intro")}
        </Typography>
      </Box>

      <Card gap={14}>
        <SwitchRow
          label={t("enable")}
          hint={t("enableHint")}
          checked={enabled}
          onChange={(v) => onChange("booking_enabled", v)}
        />
        {missingDuration && (
          <Typography variant="caption" color="var(--error, #ef4444)">
            {t("noDurationNote")}
          </Typography>
        )}
      </Card>

      {enabled && (
        <>
          <Card gap={14}>
            <Typography variant="body" fontWeight={600}>
              {t("fulfillmentTitle")}
            </Typography>
            <SwitchRow
              label={t("inBranch")}
              hint={t("inBranchHint")}
              checked={inBranch}
              onChange={(v) => onChange("booking_in_branch", v)}
            />
            <SwitchRow
              label={t("onPremises")}
              hint={t("onPremisesHint")}
              checked={onPremises}
              onChange={(v) => onChange("booking_on_premises", v)}
            />
            {!inBranch && !onPremises && (
              <Typography variant="caption" color="var(--error, #ef4444)">
                {t("noFulfillmentNote")}
              </Typography>
            )}
          </Card>

          <Card gap={14}>
            <Box flexDirection="column" gap={2}>
              <Typography variant="body" fontWeight={600}>
                {t("branchesTitle")}
              </Typography>
              <Typography variant="caption" color="var(--foreground)">
                {branches.length === 0 ? t("branchesEmpty") : t("branchesHint")}
              </Typography>
            </Box>
            {branches.map((branch) => (
              <SwitchRow
                key={branch.id}
                label={branch.name}
                checked={selectedBranchIds.includes(branch.id)}
                onChange={() => toggleBranch(branch.id)}
              />
            ))}
            {branches.length > 0 && selectedBranchIds.length === 0 && (
              <Typography variant="caption" color="var(--foreground)">
                {t("allBranchesNote")}
              </Typography>
            )}
          </Card>

          {/* Party size. Between fulfillment and payment because it is the last
            thing about *what* is being sold, and the first thing that changes
            what is charged. */}
          <Card gap={14}>
            <Box flexDirection="column" gap={2}>
              <Typography variant="body" fontWeight={600}>
                {t("partyTitle")}
              </Typography>
              <Typography variant="caption" color="var(--foreground)">
                {t("partyHint")}
              </Typography>
            </Box>
            <SwitchRow
              label={t("partyEnable")}
              hint={t("partyEnableHint")}
              checked={partyEnabled}
              onChange={(v) => onChange("booking_party_enabled", v)}
            />
            {partyEnabled && (
              <>
                <Box gap={12} flexWrap="wrap">
                  <TextInput
                    label={t("partyMin")}
                    type="number"
                    min={1}
                    value={String(values.booking_party_min ?? 1)}
                    onChange={(v) => onChange("booking_party_min", v)}
                    flex="1"
                    minWidth={140}
                  />
                  <TextInput
                    label={t("partyMax")}
                    type="number"
                    min={1}
                    value={String(values.booking_party_max ?? 10)}
                    onChange={(v) => onChange("booking_party_max", v)}
                    flex="1"
                    minWidth={140}
                  />
                </Box>
                {/* The one misconfiguration that produces a working form which
                  refuses every booking: a maximum above what any single
                  resource can seat. The customer would pick a party the
                  calendar then shows no slots for. */}
                {seatCeiling > 0 && partyMax > seatCeiling && (
                  <Typography variant="caption" color="var(--error, #ef4444)">
                    {t("partyExceedsCapacity", { seats: seatCeiling })}
                  </Typography>
                )}
              </>
            )}
          </Card>

          {/* Which resources. Rendered only when the tenant actually has some -
            an empty section here would suggest a step that does not exist for
            a business with no boats to pick between. */}
          {reachablePools.length > 0 && (
            <Card gap={14}>
              <Box flexDirection="column" gap={2}>
                <Typography variant="body" fontWeight={600}>
                  {t("poolsTitle")}
                </Typography>
                <Typography variant="caption" color="var(--foreground)">
                  {t("poolsHint")}
                </Typography>
              </Box>
              {reachableBranches.map((branch) =>
                branch.pools.map((pool) => (
                  <SwitchRow
                    key={pool.id}
                    label={
                      reachableBranches.length > 1
                        ? `${branch.name} - ${pool.name}`
                        : pool.name
                    }
                    hint={t("poolSeats", { seats: pool.largestCapacity })}
                    checked={selectedPoolIds.includes(pool.id)}
                    onChange={() => togglePool(pool.id)}
                  />
                )),
              )}
              {selectedPoolIds.length === 0 && (
                <Typography variant="caption" color="var(--foreground)">
                  {t("allPoolsNote")}
                </Typography>
              )}
            </Card>
          )}

          <Card gap={14}>
            <Box flexDirection="column" gap={2}>
              <Typography variant="body" fontWeight={600}>
                {t("paymentTitle")}
              </Typography>
              <Typography variant="caption" color="var(--foreground)">
                {t("paymentHint")}
              </Typography>
            </Box>
            <SwitchRow
              label={t("payFull")}
              hint={t("payFullHint")}
              checked={payFull}
              onChange={(v) => onChange("booking_pay_full", v)}
            />
            <SwitchRow
              label={t("payDeposit")}
              hint={t("payDepositHint")}
              checked={payDeposit}
              onChange={(v) => onChange("booking_pay_deposit", v)}
            />
            {payDeposit && (
              <TextInput
                label={t("depositPercent")}
                type="number"
                min={1}
                max={100}
                value={String(values.booking_deposit_percent ?? 30)}
                onChange={(v) => onChange("booking_deposit_percent", v)}
                helperText={t("depositPercentHint")}
                maxWidth={220}
              />
            )}
            <SwitchRow
              label={t("payInPerson")}
              hint={t("payInPersonHint")}
              checked={payInPerson}
              onChange={(v) => onChange("booking_pay_in_person", v)}
            />
            {noPaymentOption && (
              <Typography variant="caption" color="var(--foreground)">
                {t("noPaymentNote")}
              </Typography>
            )}
          </Card>
        </>
      )}
    </Box>
  );
}

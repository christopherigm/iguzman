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
}

interface ServiceBookingSectionProps {
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  branches: BookingBranchOption[];
  /** Branch ids this service is offered at. Empty means every branch. */
  selectedBranchIds: number[];
  onBranchesChange: (ids: number[]) => void;
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
 */
export function ServiceBookingSection({
  values,
  onChange,
  branches,
  selectedBranchIds,
  onBranchesChange,
}: ServiceBookingSectionProps) {
  const t = useTranslations("AdminServiceBooking");

  const enabled = Boolean(values.booking_enabled);
  const inBranch = Boolean(values.booking_in_branch);
  const onPremises = Boolean(values.booking_on_premises);
  const payFull = Boolean(values.booking_pay_full);
  const payDeposit = Boolean(values.booking_pay_deposit);
  const payInPerson = Boolean(values.booking_pay_in_person);

  const noPaymentOption = !payFull && !payDeposit && !payInPerson;

  const toggleBranch = (id: number) => {
    onBranchesChange(
      selectedBranchIds.includes(id)
        ? selectedBranchIds.filter((b) => b !== id)
        : [...selectedBranchIds, id],
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

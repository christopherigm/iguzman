"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { formatPrice } from "@/lib/price";
import { lineTotal, type PosLine } from "@/lib/pos";

interface Props {
  lines: PosLine[];
  total: number;
  currency: string;
  mixedCurrency: boolean;
  onQuantityChange: (key: string, quantity: number) => void;
  onClear: () => void;
  onCharge: () => void;
  /** xs only: dismiss the basket sheet and go back to the grid. */
  onClose: () => void;
}

/**
 * What has been rung up, and the button that starts taking money.
 *
 * Every figure here is the client's own arithmetic over what the page loaded -
 * the server re-prices the whole basket at checkout and its answer is what is
 * charged. That is why a mixed-currency basket is caught and reported here
 * rather than being allowed to reach the terminal: the API refuses it, and
 * finding that out with a customer's card already in hand is the bad version.
 */
export function PosBasket({
  lines,
  total,
  currency,
  mixedCurrency,
  onQuantityChange,
  onClear,
  onCharge,
  onClose,
}: Props) {
  const t = useTranslations("Pos");
  const tCommon = useTranslations("Common");
  const [confirmingClear, setConfirmingClear] = useState(false);

  return (
    <Box flexDirection="column" height="100%" styles={{ minHeight: 0 }}>
      <Box
        alignItems="center"
        justifyContent="space-between"
        gap={8}
        padding={12}
        styles={{ borderBottom: "1px solid var(--border, #e5e7eb)" }}
      >
        <Typography as="h2" variant="h4" margin={0} fontWeight={700}>
          {t("basket")}
        </Typography>
        <Box alignItems="center" gap={8}>
          {lines.length > 0 && (
            <Button
              text={t("clear")}
              size="md"
              onClick={() => setConfirmingClear(true)}
              kind="error"
            />
          )}
          {/* xs only - from sm up the basket is a permanent column with
              nothing to close. */}
          <Box className="pos-basket__close">
            <Button
              text={t("back")}
              size="md"
              onClick={onClose}
              aria-label={t("back")}
              kind="primary"
            />
          </Box>
        </Box>
      </Box>

      <Box
        flex="1 1 auto"
        flexDirection="column"
        gap={8}
        padding={12}
        styles={{ minHeight: 0, overflowY: "auto" }}
      >
        {lines.length === 0 ? (
          <Typography variant="body" margin={0} paddingY={24} textAlign="center">
            {t("basketEmpty")}
          </Typography>
        ) : (
          lines.map((line) => (
            <Box
              key={line.key}
              flexDirection="column"
              gap={6}
              paddingBottom={8}
              styles={{ borderBottom: "1px solid var(--border, #e5e7eb)" }}
            >
              <Box justifyContent="space-between" gap={10} alignItems="flex-start">
                <Typography variant="body" margin={0} fontWeight={600}>
                  {line.name}
                </Typography>
                <Typography variant="body" margin={0} fontWeight={700}>
                  {formatPrice(lineTotal(line).toFixed(2), line.currency)}
                </Typography>
              </Box>

              {line.customizationLabels.length > 0 && (
                <Typography variant="caption" margin={0}>
                  {line.customizationLabels.join(" · ")}
                </Typography>
              )}

              <Box alignItems="center" gap={6}>
                <Button
                  text="-"
                  size="lg"
                  minWidth={42}
                  aria-label={t("decrease")}
                  onClick={() =>
                    onQuantityChange(line.key, line.quantity - 1)
                  }
                />
                <Typography
                  as="span"
                  variant="h5"
                  margin={0}
                  minWidth={36}
                  textAlign="center"
                  aria-live="polite"
                >
                  {line.quantity}
                </Typography>
                <Button
                  text="+"
                  size="lg"
                  minWidth={42}
                  aria-label={t("increase")}
                  onClick={() =>
                    onQuantityChange(line.key, line.quantity + 1)
                  }
                />
              </Box>
            </Box>
          ))
        )}
      </Box>

      <Box
        flexDirection="column"
        gap={10}
        padding={12}
        styles={{ borderTop: "1px solid var(--border, #e5e7eb)" }}
      >
        {mixedCurrency && (
          <Typography variant="body" margin={0} color="var(--error, #ef4444)">
            {t("mixedCurrency")}
          </Typography>
        )}
        <Box alignItems="baseline" justifyContent="space-between" gap={10}>
          <Typography variant="body" margin={0}>
            {t("total")}
          </Typography>
          <Typography variant="h3" margin={0} fontWeight={700}>
            {formatPrice(total.toFixed(2), currency)}
          </Typography>
        </Box>
        <Button
          text={t("charge")}
          kind="success"
          size="xl"
          width="100%"
          disabled={lines.length === 0 || mixedCurrency}
          onClick={onCharge}
        />
      </Box>

      {confirmingClear && (
        <ConfirmationModal
          title={t("clearConfirmTitle")}
          text={t("clearConfirmText")}
          okLabel={t("clear")}
          cancelLabel={tCommon("cancel")}
          okCallback={() => {
            onClear();
            setConfirmingClear(false);
          }}
          cancelCallback={() => setConfirmingClear(false)}
        />
      )}
    </Box>
  );
}

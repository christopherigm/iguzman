"use client";

import { useMemo, useState } from "react";
import { Box } from "@repo/ui/core-elements/box";
import { Toast } from "@repo/ui/core-elements/toast";
import { useTranslations } from "next-intl";
import type { PosCatalogItem, PosLine } from "@/lib/pos";
import {
  addLine,
  basketCount,
  basketCurrencies,
  basketTotal,
  lineKey,
  setLineQuantity,
} from "@/lib/pos";
import { PosTopBar } from "./_components/pos-top-bar";
import { PosMobileSummary } from "./_components/pos-mobile-summary";
import { PosCatalog } from "./_components/pos-catalog";
import { PosBasket } from "./_components/pos-basket";
import { PosCustomizerModal } from "./_components/pos-customizer-modal";
import { PosChargePanel } from "./_components/pos-charge-panel";
import "./pos.css";

interface Props {
  items: PosCatalogItem[];
  locale: string;
}

/**
 * The till. Owns the basket and which of the two screens is showing; everything
 * else is presentation.
 *
 * The basket lives in component state and nowhere else - see `lib/pos.ts` for
 * why it is deliberately not persisted. On a completed sale it is emptied and
 * the screen returns to the catalog, ready for the next customer, which is the
 * only "navigation" this screen has.
 */
export function PosTerminal({ items, locale }: Props) {
  const t = useTranslations("Pos");

  const [lines, setLines] = useState<PosLine[]>([]);
  const [charging, setCharging] = useState(false);
  /** The item whose add-ons are being configured, if any. */
  const [customizing, setCustomizing] = useState<PosCatalogItem | null>(null);
  /** Shown after a completed sale, and on a refused one. */
  const [toast, setToast] = useState<{
    message: string;
    variant: "success" | "error";
    id: number;
  } | null>(null);
  /** On xs the basket is a full-screen sheet rather than a second column. */
  const [basketOpen, setBasketOpen] = useState(false);

  const count = useMemo(() => basketCount(lines), [lines]);
  const total = useMemo(() => basketTotal(lines), [lines]);
  const currencies = useMemo(() => basketCurrencies(lines), [lines]);
  // An order carries exactly one currency and the API refuses a mixed basket, so
  // the till says so here rather than at the moment of charging.
  const mixedCurrency = currencies.length > 1;
  const currency = currencies[0] ?? "";

  const notify = (message: string, variant: "success" | "error") =>
    setToast((prev) => ({ message, variant, id: (prev?.id ?? 0) + 1 }));

  /** Ring up one unit of a plain item - no add-ons to ask about. */
  const addItem = (item: PosCatalogItem) => {
    setLines((prev) =>
      addLine(prev, {
        key: lineKey(item.kind, item.id, []),
        kind: item.kind,
        id: item.id,
        name: item.name,
        image: item.image,
        basePrice: parseFloat(item.price),
        upcharge: 0,
        currency: item.currency,
        quantity: 1,
        customization: [],
        customizationLabels: [],
      }),
    );
  };

  const handleSelect = (item: PosCatalogItem) => {
    // Only a menu item the tenant made configurable opens the customiser;
    // everything else lands in the basket on the first tap, which is what keeps
    // the common case one touch.
    if (item.kind === "menu_item" && item.ingredients.length > 0) {
      setCustomizing(item);
      return;
    }
    addItem(item);
  };

  const handleCompleted = () => {
    setLines([]);
    setCharging(false);
    setBasketOpen(false);
    notify(t("saleCompleted"), "success");
  };

  return (
    <Box className="pos-shell" flexDirection="column">
      <PosTopBar
        title={t("title")}
        exitLabel={t("exit")}
        count={count}
        onOpenBasket={() => setBasketOpen(true)}
        basketLabel={t("viewBasket")}
      />

      <Box className="pos-body">
        <Box className="pos-catalog-pane">
          <PosCatalog items={items} onSelect={handleSelect} />
        </Box>

        {/* One basket, rendered once. On sm+ `pos-basket-pane` is the second
            column; on xs the same node becomes a full-screen sheet, so the
            basket cannot get out of step between the two layouts. */}
        <Box
          className={`pos-basket-pane${basketOpen ? " pos-basket-pane--open" : ""}`}
        >
          {charging ? (
            <PosChargePanel
              lines={lines}
              total={total}
              currency={currency}
              onCompleted={handleCompleted}
              onBack={() => setCharging(false)}
              onError={(message) => notify(message, "error")}
            />
          ) : (
            <PosBasket
              lines={lines}
              total={total}
              currency={currency}
              mixedCurrency={mixedCurrency}
              onQuantityChange={(key, quantity) =>
                setLines((prev) => setLineQuantity(prev, key, quantity))
              }
              onClear={() => setLines([])}
              onCharge={() => setCharging(true)}
              onClose={() => setBasketOpen(false)}
            />
          )}
        </Box>
      </Box>

      {/* The xs-only bar that opens the sheet. `pos-mobile-bar` hides it from sm
          up, where the basket is always on screen anyway. */}
      {count > 0 && !basketOpen && (
        <PosMobileSummary
          count={count}
          total={total}
          currency={currency}
          label={t("viewBasket")}
          onOpen={() => setBasketOpen(true)}
        />
      )}

      {customizing && (
        <PosCustomizerModal
          item={customizing}
          locale={locale}
          onCancel={() => setCustomizing(null)}
          onConfirm={(line) => {
            setLines((prev) => addLine(prev, line));
            setCustomizing(null);
          }}
        />
      )}

      {toast && (
        <Toast
          key={toast.id}
          message={toast.message}
          variant={toast.variant}
          position="top-center"
          duration={4}
        />
      )}
    </Box>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Card } from "@repo/ui/core-elements/card";
import { Switch } from "@repo/ui/core-elements/switch";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Typography } from "@repo/ui/core-elements/typography";

/**
 * One bookable thing inside a pool, in the shape the API reads and writes.
 *
 * ⚠ `id` is optional but load-bearing: a row that carries one is **updated**
 * server-side, and a row that does not is created. `Booking.resource` points at
 * these, so a row that loses its id on the way through this editor comes back as
 * a *different* resource and every appointment on the old one is set to null.
 * Never rebuild this array from scratch on edit.
 */
export interface BookingResourceRow {
  id?: number;
  name: string;
  en_name?: string | null;
  capacity: number;
  enabled: boolean;
  sort_order: number;
}

/** One pool and its resources, as the branch form submits them. */
export interface ResourcePoolRow {
  id?: number;
  name: string;
  en_name?: string | null;
  unit_label?: string | null;
  en_unit_label?: string | null;
  customer_selectable: boolean;
  enabled: boolean;
  sort_order: number;
  resources: BookingResourceRow[];
}

interface ResourcePoolsEditorProps {
  value: ResourcePoolRow[];
  onChange: (pools: ResourcePoolRow[]) => void;
  /** The branch's own `booking_capacity`, shown as the fallback this editor
   *  overrides once a pool exists. Purely explanatory. */
  branchCapacity: number;
}

/**
 * The boats, guides, rooms or tables a location books against.
 *
 * **Entirely optional, and the empty state says so.** A branch with no pools
 * falls back to one implicit resource holding the branch's own capacity, which
 * is exactly how bookings worked before pools existed - so the first thing this
 * editor does is tell the operator they need not use it.
 *
 * **One row per resource that differs in capacity or that a customer can pick by
 * name.** Six identical eight-seat tables are *one* row with capacity 48, not
 * six rows: the engine only needs to tell parties apart from each other, and six
 * rows would make it refuse a party of ten that four of those tables could seat
 * together. Two boats of different sizes are two rows, because which one a party
 * of six lands on is a real question. The help text on the capacity field says
 * this, because it is the single modelling decision an operator can get wrong.
 *
 * Submitted with the rest of the branch form, like the hours editor - but
 * **upserted rather than replaced** on the API side, for the `Booking.resource`
 * reason above.
 */
export function ResourcePoolsEditor({
  value,
  onChange,
  branchCapacity,
}: ResourcePoolsEditorProps) {
  const t = useTranslations("AdminResourcePools");

  const setPool = (index: number, patch: Partial<ResourcePoolRow>) => {
    onChange(
      value.map((pool, i) => (i === index ? { ...pool, ...patch } : pool)),
    );
  };

  const addPool = () => {
    onChange([
      ...value,
      {
        name: "",
        en_name: "",
        unit_label: "",
        en_unit_label: "",
        customer_selectable: false,
        enabled: true,
        sort_order: value.length,
        resources: [],
      },
    ]);
  };

  const removePool = (index: number) => {
    onChange(
      value
        .filter((_, i) => i !== index)
        .map((pool, i) => ({ ...pool, sort_order: i })),
    );
  };

  const setResource = (
    poolIndex: number,
    resourceIndex: number,
    patch: Partial<BookingResourceRow>,
  ) => {
    const pool = value[poolIndex];
    if (!pool) return;
    setPool(poolIndex, {
      resources: pool.resources.map((r, i) =>
        i === resourceIndex ? { ...r, ...patch } : r,
      ),
    });
  };

  const addResource = (poolIndex: number) => {
    const pool = value[poolIndex];
    if (!pool) return;
    setPool(poolIndex, {
      resources: [
        ...pool.resources,
        {
          name: "",
          en_name: "",
          capacity: 1,
          enabled: true,
          sort_order: pool.resources.length,
        },
      ],
    });
  };

  const removeResource = (poolIndex: number, resourceIndex: number) => {
    const pool = value[poolIndex];
    if (!pool) return;
    setPool(poolIndex, {
      resources: pool.resources
        .filter((_, i) => i !== resourceIndex)
        .map((r, i) => ({ ...r, sort_order: i })),
    });
  };

  return (
    <Box flexDirection="column" gap={12} width="100%">
      <Box flexDirection="column" gap={4}>
        <Typography as="h3" variant="h4">
          {t("title")}
        </Typography>
        <Typography variant="body" color="var(--foreground)">
          {value.length === 0
            ? t("emptyHelp", { capacity: branchCapacity })
            : t("help")}
        </Typography>
      </Box>

      {value.map((pool, poolIndex) => {
        const totalSeats = pool.resources
          .filter((r) => r.enabled)
          .reduce((sum, r) => sum + (Number(r.capacity) || 0), 0);
        const largest = pool.resources
          .filter((r) => r.enabled)
          .reduce((max, r) => Math.max(max, Number(r.capacity) || 0), 0);

        return (
          <Card key={pool.id ?? `new-${poolIndex}`} gap={12} padding={12}>
            <Box alignItems="center" justifyContent="space-between" gap={12}>
              <Typography variant="body" fontWeight={600}>
                {pool.name || t("untitledPool")}
              </Typography>
              <Box alignItems="center" gap={8}>
                <Switch
                  checked={pool.enabled}
                  onChange={(checked) =>
                    setPool(poolIndex, { enabled: checked })
                  }
                  aria-label={t("poolEnabled")}
                />
                <Button
                  text={t("removePool")}
                  size="sm"
                  onClick={() => removePool(poolIndex)}
                />
              </Box>
            </Box>

            <Box gap={12} flexWrap="wrap">
              <TextInput
                label={t("poolName")}
                value={pool.name}
                onChange={(v) => setPool(poolIndex, { name: v })}
                flex="1"
                minWidth={180}
              />
              <TextInput
                label={t("poolEnName")}
                value={pool.en_name ?? ""}
                onChange={(v) => setPool(poolIndex, { en_name: v })}
                flex="1"
                minWidth={180}
              />
            </Box>

            <Box gap={12} flexWrap="wrap">
              <TextInput
                label={t("unitLabel")}
                value={pool.unit_label ?? ""}
                onChange={(v) => setPool(poolIndex, { unit_label: v })}
                helperText={t("unitLabelHint")}
                flex="1"
                minWidth={180}
              />
              <TextInput
                label={t("enUnitLabel")}
                value={pool.en_unit_label ?? ""}
                onChange={(v) => setPool(poolIndex, { en_unit_label: v })}
                flex="1"
                minWidth={180}
              />
            </Box>

            <Box flexDirection="column" gap={4}>
              <Box alignItems="center" gap={8}>
                <Switch
                  checked={pool.customer_selectable}
                  onChange={(checked) =>
                    setPool(poolIndex, { customer_selectable: checked })
                  }
                  aria-label={t("customerSelectable")}
                />
                <Typography variant="body">
                  {t("customerSelectable")}
                </Typography>
              </Box>
              <Typography variant="caption" color="var(--foreground)">
                {t("customerSelectableHint")}
              </Typography>
            </Box>

            {/* The resources themselves. */}
            <Box flexDirection="column" gap={8}>
              <Typography as="h4" variant="h5">
                {t("resourcesTitle")}
              </Typography>

              {pool.resources.length === 0 && (
                <Typography variant="caption" color="var(--foreground)">
                  {t("noResources")}
                </Typography>
              )}

              {pool.resources.map((resource, resourceIndex) => (
                <Box
                  key={resource.id ?? `new-${resourceIndex}`}
                  gap={10}
                  flexWrap="wrap"
                  alignItems="flex-end"
                >
                  <TextInput
                    label={t("resourceName")}
                    value={resource.name}
                    onChange={(v) =>
                      setResource(poolIndex, resourceIndex, { name: v })
                    }
                    flex="2"
                    minWidth={160}
                  />
                  <TextInput
                    label={t("resourceEnName")}
                    value={resource.en_name ?? ""}
                    onChange={(v) =>
                      setResource(poolIndex, resourceIndex, { en_name: v })
                    }
                    flex="2"
                    minWidth={140}
                  />
                  <TextInput
                    label={t("resourceCapacity")}
                    type="number"
                    value={String(resource.capacity)}
                    onChange={(v) =>
                      setResource(poolIndex, resourceIndex, {
                        capacity: Math.max(1, Number(v) || 1),
                      })
                    }
                    helperText={t("resourceCapacityHint")}
                    flex="1"
                    minWidth={120}
                  />
                  <Box alignItems="center" gap={8} paddingBottom={6}>
                    <Switch
                      checked={resource.enabled}
                      onChange={(checked) =>
                        setResource(poolIndex, resourceIndex, {
                          enabled: checked,
                        })
                      }
                      aria-label={`${resource.name || t("resourceName")} - ${t("poolEnabled")}`}
                    />
                    <Button
                      text={t("removeResource")}
                      size="sm"
                      onClick={() => removeResource(poolIndex, resourceIndex)}
                    />
                  </Box>
                </Box>
              ))}

              <Box
                justifyContent="space-between"
                alignItems="center"
                gap={12}
                flexWrap="wrap"
              >
                <Button
                  text={t("addResource")}
                  size="sm"
                  onClick={() => addResource(poolIndex)}
                />
                {pool.resources.length > 0 && (
                  // The two numbers an operator needs to sanity-check what they
                  // just modelled: how many people the pool holds in total, and
                  // the biggest party any one resource could take - which is the
                  // real ceiling, since a party never splits across two.
                  <Typography variant="caption" color="var(--foreground)">
                    {t("poolSummary", { total: totalSeats, largest })}
                  </Typography>
                )}
              </Box>
            </Box>
          </Card>
        );
      })}

      <Box>
        <Button text={t("addPool")} size="md" onClick={addPool} />
      </Box>
    </Box>
  );
}

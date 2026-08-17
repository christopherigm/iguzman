"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { AdminEntityList } from "@/components/admin/admin-entity-list";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import {
  AdminApiError,
  listIngredients,
  deleteIngredient,
  updateIngredient,
  type IngredientDeleteMode,
  type IngredientUsage,
} from "@/lib/admin-api";
import { useSession } from "@repo/auth/session-provider";
import { useToggleEnabled } from "@/hooks/use-toggle-enabled";
import { useReorder } from "@/hooks/use-reorder";
import { IngredientInUseModal } from "./ingredient-in-use-modal";

export default function AdminIngredientsPage() {
  const t = useTranslations("Admin");
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const systemId = useSession()?.systemId ?? 0;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listIngredients(systemId));
    } catch {
      setError(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [systemId, t]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const handleToggleEnabled = useToggleEnabled(
    updateIngredient,
    setItems,
    setError,
  );
  const handleReorder = useReorder(updateIngredient, setItems, setError);

  // An ingredient a dish still references is refused by the API with the list of
  // rows holding it down, so the delete becomes a question rather than a dead
  // end - see `IngredientInUseModal` for the two answers.
  const [conflict, setConflict] = useState<{
    id: number;
    usages: IngredientUsage[];
  } | null>(null);
  const [resolving, setResolving] = useState(false);

  const removeIngredient = async (id: number, mode?: IngredientDeleteMode) => {
    await deleteIngredient(id, mode);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleDelete = async (id: number) => {
    setError(null);
    try {
      await removeIngredient(id);
    } catch (err) {
      const usages = inUseUsages(err);
      if (usages) {
        setConflict({ id, usages });
        return;
      }
      setError(t("errorDelete"));
    }
  };

  const handleResolve = async (mode: IngredientDeleteMode) => {
    if (conflict === null) return;
    setResolving(true);
    try {
      await removeIngredient(conflict.id, mode);
      setConflict(null);
    } catch {
      setConflict(null);
      setError(t("errorDelete"));
    } finally {
      setResolving(false);
    }
  };

  const columns = [
    { key: "image", label: t("image") ?? "Image", compact: true },
    { key: "name", label: t("name") },
    { key: "unit", label: t("unit") ?? "Unit" },
    { key: "calories", label: t("calories") ?? "Calories" },
    { key: "enabled", label: t("enabled") },
  ];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: t("breadcrumbAdmin"), href: "/admin" },
          { label: t("ingredients") },
        ]}
      />
      <AdminEntityList
        title={t("ingredients")}
        items={items}
        columns={columns}
        basePath="/admin/ingredients"
        onDelete={handleDelete}
        onToggleEnabled={handleToggleEnabled}
        onReorder={handleReorder}
        loading={loading}
        error={error}
      />
      {conflict !== null && (
        <IngredientInUseModal
          usages={conflict.usages}
          busy={resolving}
          onConfirm={handleResolve}
          onCancel={() => setConflict(null)}
        />
      )}
    </>
  );
}

/**
 * The blocking rows out of a failed delete, or `null` when the failure was
 * something else. The 409 is the only outcome with an answer the admin can give,
 * so anything else still falls through to the generic error line.
 */
function inUseUsages(err: unknown): IngredientUsage[] | null {
  if (!(err instanceof AdminApiError) || err.status !== 409) return null;
  if (err.data.code !== "INGREDIENT_IN_USE") return null;
  const usages = err.data.usages;
  return Array.isArray(usages) ? (usages as IngredientUsage[]) : null;
}

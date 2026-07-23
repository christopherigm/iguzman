"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  AdminEntityList,
  CellText,
  EmptyCell,
  type Column,
} from "@/components/admin/admin-entity-list";
import { Badge } from "@repo/ui/core-elements/badge";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import { listBranches, deleteBranch, updateBranch } from "@/lib/admin-api";
import { useSession } from "@repo/auth/session-provider";
import { useToggleEnabled } from "@/hooks/use-toggle-enabled";
import { useReorder } from "@/hooks/use-reorder";

export default function AdminBranchesPage() {
  const t = useTranslations("Admin");
  const tc = useTranslations("AdminBranches");
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const systemId = useSession()?.systemId ?? 0;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listBranches(systemId));
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

  const handleToggleEnabled = useToggleEnabled(updateBranch, setItems, setError);
  const handleReorder = useReorder(updateBranch, setItems, setError);
  const handleDelete = async (id: number) => {
    try {
      await deleteBranch(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      setError(t("errorDelete"));
    }
  };

  const columns: Column[] = [
    {
      key: "name",
      label: t("name"),
      render: (v, row) => (
        <CellText>
          {String(v || tc("unnamed"))}
          {row.is_main ? " " : ""}
          {row.is_main ? (
            <Badge variant="subtle" size="sm" color="var(--accent, #2196f3)">
              {tc("main")}
            </Badge>
          ) : null}
        </CellText>
      ),
    },
    {
      key: "address",
      label: tc("address"),
      render: (v) => (v ? <CellText>{String(v)}</CellText> : <EmptyCell />),
    },
    {
      key: "phone",
      label: tc("phone"),
      render: (v) => (v ? <CellText>{String(v)}</CellText> : <EmptyCell />),
    },
    { key: "enabled", label: t("enabled") },
  ];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: t("breadcrumbAdmin"), href: "/admin" },
          { label: tc("title") },
        ]}
      />
      <AdminEntityList
        title={tc("title")}
        items={items}
        columns={columns}
        basePath="/admin/branches"
        onDelete={handleDelete}
        onToggleEnabled={handleToggleEnabled}
        onReorder={handleReorder}
        loading={loading}
        error={error}
      />
    </>
  );
}

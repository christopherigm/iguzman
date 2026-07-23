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
import {
  listContactMessages,
  deleteContactMessage,
  type AdminContactMessage,
} from "@/lib/admin-api";

export default function AdminMessagesPage() {
  const t = useTranslations("Admin");
  const tm = useTranslations("AdminMessages");
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const messages = await listContactMessages();
      setItems(messages as unknown as Record<string, unknown>[]);
    } catch {
      setError(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const handleDelete = async (id: number) => {
    try {
      await deleteContactMessage(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      setError(t("errorDelete"));
    }
  };

  const columns: Column[] = [
    {
      key: "is_read",
      label: tm("status"),
      render: (v) =>
        v ? (
          <CellText>{tm("read")}</CellText>
        ) : (
          <Badge variant="filled" size="sm" color="var(--accent, #2196f3)">
            {tm("unread")}
          </Badge>
        ),
    },
    {
      key: "name",
      label: tm("from"),
      render: (v, row) => (
        <CellText title={String(row.email ?? "")}>{String(v ?? "")}</CellText>
      ),
    },
    {
      key: "subject",
      label: tm("subject"),
      render: (v, row) => {
        const rel = (row as unknown as AdminContactMessage).related_name;
        const text = String(v || rel || "");
        return text ? <CellText>{text}</CellText> : <EmptyCell />;
      },
    },
    {
      key: "created",
      label: tm("date"),
      render: (v) => (
        <CellText>{new Date(String(v)).toLocaleDateString()}</CellText>
      ),
    },
  ];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: t("breadcrumbAdmin"), href: "/admin" },
          { label: tm("title") },
        ]}
      />
      <AdminEntityList
        title={tm("title")}
        items={items}
        columns={columns}
        basePath="/admin/messages"
        onDelete={handleDelete}
        loading={loading}
        error={error}
        hideCreate
      />
    </>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { AdminEntityList } from "@/components/admin/admin-entity-list";
import { AdminForm, type FieldDef } from "@/components/admin/admin-form";
import { SectionBandSection } from "@/components/admin/section-band-section";
import { Box } from "@repo/ui/core-elements/box";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import {
  listHighlights,
  deleteHighlight,
  updateHighlight,
  getSystem,
  updateSystem,
} from "@/lib/admin-api";
import { useSession } from "@repo/auth/session-provider";
import { useToggleEnabled } from "@/hooks/use-toggle-enabled";
import { useReorder } from "@/hooks/use-reorder";

/**
 * The System fields this page owns and writes - everything about the landing's
 * Company Highlights section that isn't a highlight record: its heading pair and
 * the colour band it sits on. They used to live on /admin/system, away from the
 * items they title. Everything else on the record belongs to /admin/system,
 * /admin/logos-and-styles, /admin/about, /admin/featured-spotlight or
 * /admin/payments; the API PATCHes, so a payload of just these keys leaves the
 * rest untouched - which is what keeps the pages from clobbering each other when
 * more than one is open.
 */
const OWNED_FIELDS = [
  "highlights_title",
  "en_highlights_title",
  "highlights_subtitle",
  "en_highlights_subtitle",
  "highlights_bg",
  "highlights_top_divider",
  "highlights_bottom_divider",
] as const;

/** Blank string is the right empty value for every owned key except the dividers. */
const DEFAULTS: Record<string, unknown> = {
  highlights_top_divider: "none",
  highlights_bottom_divider: "none",
};

/**
 * Loaded only so the band preview can paint on the tenant's real page colour -
 * the backgrounds themselves are edited on /admin/logos-and-styles. They are
 * stripped from the payload on save, so saving here can never write back a
 * stale copy of that page's work.
 */
const PREVIEW_ONLY_FIELDS = {
  background_light: "#e5e5e5",
  background_dark: "#3c3c3c",
} as const;

/** A blank gradient means "no band", which the API stores as NULL, not "". */
const NULL_WHEN_BLANK = ["highlights_bg"];

export default function AdminHighlightsPage() {
  const t = useTranslations("Admin");
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const systemId = useSession()?.systemId ?? 0;

  // ── Section settings (the System record) ──────────────────────────────────
  const [values, setValues] = useState<Record<string, unknown>>(() => ({
    ...Object.fromEntries(OWNED_FIELDS.map((k) => [k, DEFAULTS[k] ?? ""])),
    ...PREVIEW_ONLY_FIELDS,
  }));
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listHighlights(systemId));
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

  useEffect(() => {
    if (!systemId) return;
    getSystem(systemId)
      .then((data) => {
        setValues({
          ...Object.fromEntries(
            OWNED_FIELDS.map((k) => [k, data[k] ?? DEFAULTS[k] ?? ""]),
          ),
          ...Object.fromEntries(
            Object.entries(PREVIEW_ONLY_FIELDS).map(([k, fallback]) => [
              k,
              data[k] ?? fallback,
            ]),
          ),
        });
      })
      .catch(() => setSaveError(t("errorLoad")))
      .finally(() => setSettingsLoading(false));
  }, [systemId, t]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSuccess(null);
    try {
      const payload: Record<string, unknown> = Object.fromEntries(
        OWNED_FIELDS.map((k) => [k, values[k]]),
      );
      NULL_WHEN_BLANK.forEach((k) => {
        if (payload[k] === "") payload[k] = null;
      });
      await updateSystem(systemId, payload);
      setSuccess(t("saved"));
    } catch {
      setSaveError(t("errorSave"));
    } finally {
      setSaving(false);
    }
  };

  // ── The highlight records ─────────────────────────────────────────────────
  const handleToggleEnabled = useToggleEnabled(
    updateHighlight,
    setItems,
    setError,
  );
  const handleReorder = useReorder(updateHighlight, setItems, setError);
  const handleDelete = async (id: number) => {
    try {
      await deleteHighlight(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      setError(t("errorDelete"));
    }
  };

  const fields: FieldDef[] = [
    {
      key: "highlights_title",
      label: t("highlightsTitle") ?? "Highlights Title (ES)",
    },
    { key: "en_highlights_title", label: "Highlights Title (EN)" },
    {
      key: "highlights_subtitle",
      label: t("highlightsSubtitle") ?? "Highlights Subtitle (ES)",
      type: "textarea",
    },
    {
      key: "en_highlights_subtitle",
      label: "Highlights Subtitle (EN)",
      type: "textarea",
    },
  ];

  const columns = [
    { key: "image", label: "Image", compact: true },
    { key: "name", label: t("name") },
    { key: "category", label: t("category") ?? "Category" },
    { key: "size", label: t("size") ?? "Size" },
    { key: "sort_order", label: t("order") ?? "Order" },
    { key: "enabled", label: t("enabled") },
  ];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: t("breadcrumbAdmin"), href: "/admin" },
          { label: t("highlights") },
        ]}
      />
      {/* The list owns the page: its header row carries the title and every
          action - sort, save, new - at the top, as on every other CMS list, the
          highlight records come next (they are what the page is opened for), and
          the section's own settings render inside the list, below them. AdminForm
          is `embedded` for exactly that: no header row and no fixed bottom bar of
          its own, so the Save in the header above is the page's only one and there
          is never a question of which button writes the heading and which writes
          the list. */}
      <AdminEntityList
        title={t("highlights")}
        headerActions={
          // Disabled until the settings are in: saving a record that hasn't
          // loaded would PATCH the tenant's real headings away with blanks.
          <Button
            text={saving ? t("saving") : t("save")}
            onClick={() => void handleSave()}
            disabled={saving || settingsLoading}
            kind="primary"
            size="md"
          />
        }
        items={items}
        columns={columns}
        basePath="/admin/highlights"
        onDelete={handleDelete}
        onToggleEnabled={handleToggleEnabled}
        onReorder={handleReorder}
        loading={loading}
        error={error}
      >
        {/* Rendered below the table (see AdminEntityList's `children`). Waits for
            the System record rather than rendering blank inputs:
            `getSystem` landing mid-edit would overwrite whatever the operator
            had already typed. */}
        {settingsLoading ? (
          <Box padding="24px">
            <Typography variant="body">{t("loading")}</Typography>
          </Box>
        ) : (
          <AdminForm
            title={t("highlights")}
            embedded
            fields={fields}
            values={values}
            onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
            onSubmit={handleSave}
            saving={saving}
            error={saveError}
            success={success}
          >
            <SectionBandSection
              title={t("highlightsStyle")}
              // The header names the controls, so the mock band keeps the
              // section's own name - it stands in for the real one.
              previewHeading={t("sectionBackgroundsHighlights")}
              gradientLabel={t("highlightsBg")}
              backgroundKey="highlights_bg"
              topDividerKey="highlights_top_divider"
              bottomDividerKey="highlights_bottom_divider"
              values={values}
              onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
            />
          </AdminForm>
        )}
      </AdminEntityList>
    </>
  );
}

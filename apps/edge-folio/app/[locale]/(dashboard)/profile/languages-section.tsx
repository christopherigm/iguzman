"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { Select } from "@repo/ui/core-elements/select";
import { Toast } from "@repo/ui/core-elements/toast";
import {
  getLanguages,
  createLanguage,
  updateLanguage,
  deleteLanguage,
  type Language,
  type LanguageProficiency,
} from "@/lib/career";

const PROFICIENCY_OPTIONS: LanguageProficiency[] = [
  "native",
  "fluent",
  "professional",
  "basic",
];

/**
 * LanguagesPanel - add, edit and remove spoken/written languages with a
 * proficiency level. Rendered as bare content; the caller supplies the card.
 */
export function LanguagesPanel() {
  const t = useTranslations("ProfilePage");

  const proficiencyOptions = useMemo(
    () =>
      PROFICIENCY_OPTIONS.map((p) => ({
        value: p,
        label: t(`proficiencies.${p}`),
      })),
    [t],
  );

  const [loading, setLoading] = useState(true);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [newLangName, setNewLangName] = useState("");
  const [newLangProficiency, setNewLangProficiency] =
    useState<LanguageProficiency>("professional");
  const [addingLang, setAddingLang] = useState(false);
  const [langError, setLangError] = useState<string | null>(null);
  const [editingLangId, setEditingLangId] = useState<number | null>(null);
  const [editLangName, setEditLangName] = useState("");
  const [editLangProficiency, setEditLangProficiency] =
    useState<LanguageProficiency>("professional");
  const [savingLangId, setSavingLangId] = useState<number | null>(null);
  const [deletingLangId, setDeletingLangId] = useState<number | null>(null);

  useEffect(() => {
    getLanguages()
      .then((langs) => setLanguages(langs.results))
      .catch(() => setLangError(t("langAddError")))
      .finally(() => setLoading(false));
  }, [t]);

  const handleAddLanguage = useCallback(async () => {
    const name = newLangName.trim();
    if (!name) return;
    setLangError(null);
    setAddingLang(true);
    try {
      const lang = await createLanguage({
        name,
        proficiency: newLangProficiency,
        order: languages.length,
      });
      setLanguages((prev) => [...prev, lang]);
      setNewLangName("");
    } catch {
      setLangError(t("langAddError"));
    } finally {
      setAddingLang(false);
    }
  }, [newLangName, newLangProficiency, languages.length, t]);

  const handleSaveLang = useCallback(
    async (id: number) => {
      const name = editLangName.trim();
      if (!name) return;
      setLangError(null);
      setSavingLangId(id);
      try {
        await updateLanguage(id, { name, proficiency: editLangProficiency });
        setLanguages((prev) =>
          prev.map((l) =>
            l.id === id ? { ...l, name, proficiency: editLangProficiency } : l,
          ),
        );
        setEditingLangId(null);
      } catch {
        setLangError(t("langSaveError"));
      } finally {
        setSavingLangId(null);
      }
    },
    [editLangName, editLangProficiency, t],
  );

  const handleDeleteLang = useCallback(
    async (id: number) => {
      setLangError(null);
      setDeletingLangId(id);
      try {
        await deleteLanguage(id);
        setLanguages((prev) => prev.filter((l) => l.id !== id));
        if (editingLangId === id) setEditingLangId(null);
      } catch {
        setLangError(t("langDeleteError"));
      } finally {
        setDeletingLangId(null);
      }
    },
    [editingLangId, t],
  );

  if (loading) {
    return <ProgressBar label={t("loading")} />;
  }

  return (
    <>
      {langError && (
        <Toast message={langError} variant="error" position="top-center" />
      )}

      <Box display="flex" gap={8} flexDirection="column">
        <TextInput
          label={t("langNameLabel")}
          type="text"
          value={newLangName}
          onChange={(v) => {
            setNewLangName(v);
            setLangError(null);
          }}
          placeholder={t("langNamePlaceholder")}
          aria-label={t("langNameLabel")}
        />
        <Box display="flex" alignItems="center" gap={12} marginBottom={20}>
          <Select
            label={t("langProficiencyLabel")}
            value={newLangProficiency}
            onChange={(v) => {
              setNewLangProficiency(v as LanguageProficiency);
            }}
            options={proficiencyOptions}
          />
          <Button
            text={addingLang ? t("langAdding") : t("langAdd")}
            type="button"
            size="lg"
            kind="primary"
            disabled={addingLang || !newLangName.trim()}
            onClick={() => void handleAddLanguage()}
          />
        </Box>
      </Box>

      {languages.length === 0 ? (
        <Typography variant="body" color="var(--muted-foreground, #6b7280)">
          {t("langEmpty")}
        </Typography>
      ) : (
        <Box display="flex" flexDirection="column" gap={8}>
          {languages.map((lang) =>
            editingLangId === lang.id ? (
              <Box
                key={lang.id}
                display="flex"
                alignItems="center"
                gap={8}
                padding={10}
                borderRadius={8}
                flexWrap="wrap"
                styles={{
                  border: "1px solid var(--border, #e5e7eb)",
                  background: "var(--surface-2)",
                }}
              >
                <Box styles={{ flex: 1, minWidth: "120px" }}>
                  <TextInput
                    type="text"
                    value={editLangName}
                    onChange={(v) => setEditLangName(v)}
                    placeholder={t("langNamePlaceholder")}
                    aria-label={t("langNameLabel")}
                  />
                </Box>
                <Select
                  label={t("langProficiencyLabel")}
                  value={editLangProficiency}
                  onChange={(v) =>
                    setEditLangProficiency(v as LanguageProficiency)
                  }
                  options={proficiencyOptions}
                />
                <Button
                  text={
                    savingLangId === lang.id ? t("langSaving") : t("langSave")
                  }
                  type="button"
                  size="lg"
                  kind="primary"
                  disabled={savingLangId === lang.id || !editLangName.trim()}
                  onClick={() => void handleSaveLang(lang.id)}
                />
                <Button
                  text={t("langCancel")}
                  type="button"
                  size="lg"
                  disabled={savingLangId === lang.id}
                  onClick={() => setEditingLangId(null)}
                />
              </Box>
            ) : (
              <Box
                key={lang.id}
                display="flex"
                alignItems="center"
                gap={8}
                padding={10}
                borderRadius={8}
                styles={{
                  border: "1px solid var(--border, #e5e7eb)",
                  background: "var(--surface-2)",
                }}
              >
                <Typography variant="body" styles={{ flex: 1 }}>
                  {lang.name}
                </Typography>
                <Typography
                  variant="body"
                  color="var(--muted-foreground, #6b7280)"
                >
                  {t(`proficiencies.${lang.proficiency}`)}
                </Typography>
                <Button
                  unstyled
                  type="button"
                  className="profile__upload-another"
                  onClick={() => {
                    setEditingLangId(lang.id);
                    setEditLangName(lang.name);
                    setEditLangProficiency(lang.proficiency);
                    setLangError(null);
                  }}
                >
                  {t("langEdit")}
                </Button>
                <Button
                  unstyled
                  type="button"
                  className="profile__upload-another"
                  disabled={deletingLangId === lang.id}
                  aria-label={`${t("langDelete")} ${lang.name}`}
                  onClick={() => void handleDeleteLang(lang.id)}
                >
                  {deletingLangId === lang.id ? "…" : t("langDelete")}
                </Button>
              </Box>
            ),
          )}
        </Box>
      )}
    </>
  );
}

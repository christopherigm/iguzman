"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Toast } from "@repo/ui/core-elements/toast";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { saveJob, deleteJob, JobsError, type JobPosting } from "@/lib/jobs";
import { JobCard } from "./(dashboard)/jobs/job-card";

interface HeroJobCardsProps {
  jobs: JobPosting[];
}

// Renders the signed-in user's private postings on the landing hero using the
// exact same JobCard as the jobs dashboard, with working save/delete handlers.
export function HeroJobCards({ jobs }: HeroJobCardsProps) {
  const t = useTranslations("JobsPage");
  const [postings, setPostings] = useState<JobPosting[]>(jobs);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [savedMap, setSavedMap] = useState<Record<number, number>>({});
  const [pendingDelete, setPendingDelete] = useState<JobPosting | null>(null);
  const [toast, setToast] = useState<{
    text: string;
    kind: "success" | "error";
  } | null>(null);
  const [toastKey, setToastKey] = useState(0);

  const showToast = useCallback((text: string, kind: "success" | "error") => {
    setToast({ text, kind });
    setToastKey((k) => k + 1);
  }, []);

  const handleSave = useCallback(
    async (posting: JobPosting) => {
      setSavingId(posting.id);
      try {
        const app = await saveJob(posting.id);
        setSavedMap((prev) => ({ ...prev, [posting.id]: app.id }));
        showToast(t("saved"), "success");
      } catch (err) {
        const isAuth = err instanceof JobsError && err.status === 401;
        showToast(isAuth ? t("errorUnauthorized") : t("errorSave"), "error");
      } finally {
        setSavingId(null);
      }
    },
    [t, showToast],
  );

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const posting = pendingDelete;
    setPendingDelete(null);
    setDeletingId(posting.id);
    try {
      await deleteJob(posting.id);
      setPostings((prev) => prev.filter((p) => p.id !== posting.id));
      showToast(t("deleted"), "success");
    } catch {
      showToast(t("errorDelete"), "error");
    } finally {
      setDeletingId(null);
    }
  }, [pendingDelete, t, showToast]);

  if (postings.length === 0) return null;

  return (
    <>
      <Box
        display="grid"
        gap={16}
        width="100%"
        styles={{
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        }}
      >
        {postings.map((posting) => (
          <JobCard
            key={posting.id}
            posting={posting}
            onSave={handleSave}
            onDelete={setPendingDelete}
            saving={savingId === posting.id}
            deleting={deletingId === posting.id}
            savedAppId={savedMap[posting.id] ?? posting.saved_application_id}
            isStaff={false}
          />
        ))}
      </Box>

      {toast && (
        <Toast
          key={toastKey}
          message={toast.text}
          variant={toast.kind}
          position="top-center"
        />
      )}

      {pendingDelete && (
        <ConfirmationModal
          title={t("confirmDeleteTitle")}
          text={t("confirmDeleteText")}
          okCallback={confirmDelete}
          cancelCallback={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Container } from "@repo/ui/core-elements/container";
import { Box } from "@repo/ui/core-elements/box";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { Toast } from "@repo/ui/core-elements/toast";
import {
  deleteApplication,
  refreshMetrics,
  type JobApplication,
} from "@/lib/applications";
import type { UserProfile } from "@/lib/auth";
import { ApplicationHeader } from "./_components/application-header";
import { ApplicationEditForm } from "./_components/application-edit-form";
import { ApplicationInfoGrid } from "./_components/application-info-grid";
import { JobDescriptionSection } from "./_components/job-description-section";
import { CompanyInfoSection } from "./_components/company-info-section";
import { ReviewTailorSection } from "./_components/review-tailor-section";
import { CoverLetterSection } from "./_components/cover-letter-section";
import { NaftaLetterSection } from "./_components/nafta-letter-section";
import { useToast } from "./_hooks/use-toast";
import { useCompanyIntel } from "./_hooks/use-company-intel";
import { useExportData } from "./_hooks/use-export-data";
import { useTailoringWorkflow } from "./_hooks/use-tailoring-workflow";
import "./application-detail-page.css";

interface Props {
  application: JobApplication;
  profile: UserProfile | null;
  profilePictureBase64?: string;
}

export function ApplicationDetailPage({
  application: initialApp,
  profile,
  profilePictureBase64,
}: Props) {
  const t = useTranslations("ApplicationDetailPage");
  const locale = useLocale();
  const router = useRouter();

  const [app, setApp] = useState(initialApp);
  const [editing, setEditing] = useState(false);

  // Delete
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Refresh metrics
  const [refreshingMetrics, setRefreshingMetrics] = useState(false);

  // Metric explanation modal
  const [explainModal, setExplainModal] = useState<{
    title: string;
    text: string;
  } | null>(null);

  const { toast, toastKey, showToast } = useToast();
  const { companyDescription, companyIntel, companyAnalysis } = useCompanyIntel(
    app,
    setApp,
  );
  const exportCtl = useExportData();
  const workflow = useTailoringWorkflow({
    app,
    setApp,
    profile,
    profilePictureBase64,
    exportCtl,
    showToast,
  });

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteApplication(app.id);
      router.push(`/${locale}/applications`);
    } catch {
      showToast(t("errorDelete"), "error");
      setDeleting(false);
    }
  }

  async function handleRefreshMetrics() {
    setRefreshingMetrics(true);
    try {
      const result = await refreshMetrics(app.id, locale);
      setApp((prev) => ({
        ...prev,
        overall_match: result.overall_match,
        overall_match_explanation: result.overall_match_explanation,
        technical_match: result.technical_match,
        technical_match_explanation: result.technical_match_explanation,
        nafta_tn_likelihood: result.nafta_tn_likelihood,
        nafta_tn_likelihood_explanation: result.nafta_tn_likelihood_explanation,
      }));
      showToast(t("refreshMetrics"), "success");
    } catch {
      showToast(t("errorRefreshMetrics"), "error");
    } finally {
      setRefreshingMetrics(false);
    }
  }

  const hasTailoredBullets =
    !!workflow.tailoredBullets && workflow.tailoredBullets.length > 0;

  return (
    <Container
      paddingX={10}
      styles={{ paddingTop: "var(--ui-navbar-height)", paddingBottom: "60px" }}
    >
      {confirmDelete && (
        <ConfirmationModal
          title={t("confirmDeleteTitle")}
          text={t("confirmDeleteText")}
          okCallback={() => {
            setConfirmDelete(false);
            handleDelete();
          }}
          cancelCallback={() => setConfirmDelete(false)}
        />
      )}

      <Box marginTop={20} />

      <Link href={`/${locale}/applications`} prefetch className="detail__back">
        ← {t("backToList")}
      </Link>

      <ApplicationHeader
        app={app}
        editing={editing}
        deleting={deleting}
        refreshingMetrics={refreshingMetrics}
        onDelete={() => setConfirmDelete(true)}
        onEdit={() => setEditing(true)}
        onRefreshMetrics={handleRefreshMetrics}
      />

      {editing && (
        <ApplicationEditForm
          app={app}
          onCancel={() => setEditing(false)}
          onSaved={(updated) => {
            setApp(updated);
            setEditing(false);
            showToast(t("savedToast"), "success");
          }}
        />
      )}

      {!editing && (
        <ApplicationInfoGrid
          app={app}
          onExplain={(item) =>
            setExplainModal({
              title: item.label,
              text: item.explanation ?? "",
            })
          }
        />
      )}

      {explainModal && (
        <ConfirmationModal
          title={explainModal.title}
          text={explainModal.text}
          okCallback={() => setExplainModal(null)}
        />
      )}

      {!editing && <JobDescriptionSection app={app} />}

      {!editing && (
        <CompanyInfoSection
          app={app}
          companyDescription={companyDescription}
          companyIntel={companyIntel}
          companyAnalysis={companyAnalysis}
        />
      )}

      <ReviewTailorSection
        profile={profile}
        exportCtl={exportCtl}
        workflow={workflow}
      />

      {hasTailoredBullets && (
        <CoverLetterSection
          coverLetter={workflow.coverLetter}
          onCoverLetterChange={workflow.setCoverLetter}
          generating={workflow.generatingCL}
          error={workflow.clError}
          copied={workflow.copied}
          additionalPrompt={workflow.clAdditionalPrompt}
          onAdditionalPromptChange={workflow.setClAdditionalPrompt}
          onGenerate={workflow.handleGenerateCL}
          onCopy={workflow.handleCopy}
        />
      )}

      <NaftaLetterSection
        app={app}
        profile={profile}
        companyDescription={companyDescription}
      />

      {toast && (
        <Toast
          key={toastKey}
          message={toast.text}
          variant={toast.kind}
          position="top-center"
        />
      )}
    </Container>
  );
}

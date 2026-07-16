"use client";

import { useLocale, useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { Grid } from "@repo/ui/core-elements/grid";
import { Switch } from "@repo/ui/core-elements/switch";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { Spinner } from "@repo/ui/core-elements/spinner";
import type { UserProfile } from "@/lib/auth";
import { TailoredEditableCard } from "./tailored-editable-card";
import { SwitchRow } from "./detail-primitives";
import type { ExportDataController } from "../_hooks/use-export-data";
import type { TailoringWorkflow } from "../_hooks/use-tailoring-workflow";

interface Props {
  profile: UserProfile | null;
  exportCtl: ExportDataController;
  workflow: TailoringWorkflow;
}

/** Toggle a numeric id in/out of an inclusion Set-state. */
function toggleId(
  setter: (updater: (prev: Set<number>) => Set<number>) => void,
  id: number,
  include: boolean,
) {
  setter((prev) => {
    const next = new Set(prev);
    if (include) next.add(id);
    else next.delete(id);
    return next;
  });
}

export function ReviewTailorSection({ profile, exportCtl, workflow }: Props) {
  const t = useTranslations("ApplicationDetailPage");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const micLang: "en" | "es" = locale === "es" ? "es" : "en";

  const editCardLabels = {
    mic: t("tailoredMicLabel"),
    enhance: t("tailoredEnhanceLabel"),
    stop: t("tailoredEnhanceStop"),
    discard: t("tailoredEnhanceDiscard"),
    accept: t("tailoredEnhanceAccept"),
    save: t("tailoredSaveChanges"),
    saving: t("saving"),
  };

  // Shared labels for the paragraphs/length modal opened by the prose enhance
  // buttons (summary, work experience, projects).
  const enhanceOptionsLabels = {
    title: t("enhanceOptionsTitle"),
    text: t("enhanceOptionsText"),
    paragraphs: t("enhanceParagraphsLabel"),
    length: t("enhanceLengthLabel"),
    wordsPerPara: t("enhanceWordsPerPara"),
    ok: tCommon("ok"),
    cancel: tCommon("cancel"),
  };

  const {
    exportData,
    exportDataLoading,
    includeContact,
    setIncludeContact,
    includeLinks,
    setIncludeLinks,
    includeSkills,
    setIncludeSkills,
    includePhoto,
    setIncludePhoto,
    includedWorkExpIds,
    setIncludedWorkExpIds,
    includedEducationIds,
    setIncludedEducationIds,
    includedLanguageIds,
    setIncludedLanguageIds,
    includedProjectIds,
    setIncludedProjectIds,
  } = exportCtl;

  const {
    tailoring,
    tailoredBullets,
    tailoredWorkExperiences,
    tailoredProjects,
    grouped,
    professionalSummary,
    setProfessionalSummary,
    savedSummary,
    tailorError,
    additionalPrompt,
    setAdditionalPrompt,
    handleTailor,
    excludedBulletCats,
    setExcludedBulletCats,
    includedTailoredSkillIds,
    setIncludedTailoredSkillIds,
    bulletEdits,
    setBulletEdits,
    weEdits,
    setWeEdits,
    projectEdits,
    setProjectEdits,
    savingCard,
    weDirty,
    projectDirty,
    skillsDirty,
    buildBulletEnhance,
    buildSummaryEnhance,
    buildDescriptionEnhance,
    handleSaveBullets,
    handleSaveWorkExperiences,
    handleSaveSummary,
    handleSaveProjects,
    handleSaveSkills,
    exportingPDF,
    exportError,
    openLiveResume,
    handleExportPDF,
    handleExportMarkdown,
  } = workflow;

  return (
    <Box marginBottom={28} marginTop={48}>
      <Typography as="h2" variant="h3" fontWeight={600} marginBottom={8}>
        {t("reviewAndTailorTitle")}
      </Typography>
      <Box
        styles={{ borderBottom: "1px solid var(--border, #e5e7eb)" }}
        marginBottom={12}
      />
      <Typography
        variant="body"
        color="var(--muted-foreground, #6b7280)"
        marginBottom={14}
        as="p"
      >
        {t("selectToTailorSubtitle")}
      </Typography>

      {/* ── Selection: choose what feeds the tailoring & export ── */}
      {exportDataLoading && (
        <Box display="flex" alignItems="center" gap={8} marginBottom={14}>
          <Spinner size={16} />
          <Typography variant="body" color="var(--muted-foreground, #6b7280)">
            {t("exportLoadingData")}
          </Typography>
        </Box>
      )}

      {exportData && (
        <Box display="flex" flexDirection="column" gap={16} marginBottom={20}>
          {/* Work experience */}
          {exportData.workExps.length > 0 && (
            <Box display="flex" flexDirection="column" gap={8}>
              <Typography variant="body" fontWeight={600}>
                {t("exportJobsTitle")}
              </Typography>
              <Grid container spacing={2}>
                {exportData.workExps.map((exp) => {
                  const isIncluded = includedWorkExpIds.has(exp.id);
                  return (
                    <Grid key={exp.id} size={{ xs: 12, sm: 4, lg: 3 }}>
                      <Card
                        styles={{
                          opacity: isIncluded ? 1 : 0.5,
                          transition: "opacity 0.2s ease",
                          height: "100%",
                        }}
                      >
                        <Box
                          display="flex"
                          alignItems="start"
                          justifyContent="space-between"
                          gap={10}
                        >
                          <Box
                            display="flex"
                            flexDirection="column"
                            gap={4}
                            flex={1}
                            minWidth={0}
                          >
                            <Typography
                              variant="body"
                              fontWeight={600}
                              styles={{ lineHeight: 1.3 }}
                            >
                              {exp.title}
                            </Typography>
                            <Typography
                              variant="body"
                              color="var(--muted-foreground, #6b7280)"
                            >
                              {exp.company}
                            </Typography>
                          </Box>
                          <Switch
                            checked={isIncluded}
                            onChange={(checked) =>
                              toggleId(setIncludedWorkExpIds, exp.id, checked)
                            }
                            disabled={tailoring}
                            aria-label={t("exportIncludeItem")}
                          />
                        </Box>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>
            </Box>
          )}

          {/* Projects */}
          {exportData.projects.length > 0 && (
            <Box display="flex" flexDirection="column" gap={8}>
              <Typography variant="body" fontWeight={600}>
                {t("exportProjectsTitle")}
              </Typography>
              <Grid container spacing={2}>
                {exportData.projects.map((proj) => {
                  const isIncluded = includedProjectIds.has(proj.id);
                  return (
                    <Grid key={proj.id} size={{ xs: 12, sm: 4, lg: 3 }}>
                      <Card
                        styles={{
                          opacity: isIncluded ? 1 : 0.5,
                          transition: "opacity 0.2s ease",
                          height: "100%",
                        }}
                      >
                        <Box
                          display="flex"
                          alignItems="start"
                          justifyContent="space-between"
                          gap={10}
                        >
                          <Typography
                            variant="body"
                            fontWeight={600}
                            styles={{
                              lineHeight: 1.3,
                              flex: 1,
                              minWidth: 0,
                            }}
                          >
                            {proj.name}
                          </Typography>
                          <Switch
                            checked={isIncluded}
                            onChange={(checked) =>
                              toggleId(setIncludedProjectIds, proj.id, checked)
                            }
                            disabled={tailoring}
                            aria-label={t("exportIncludeItem")}
                          />
                        </Box>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>
            </Box>
          )}
        </Box>
      )}

      {/* Additional prompt + centered Tailor action, below the Tech Stack card */}
      <Box display="flex" flexDirection="column" gap={16} marginBottom={20}>
        <Box display="flex" flexDirection="column" gap={6}>
          <Typography variant="body" fontWeight={600}>
            {t("additionalPromptLabel")}
          </Typography>
          <TextInput
            multirow
            rows={6}
            value={additionalPrompt}
            onChange={setAdditionalPrompt}
            placeholder={t("additionalPromptPlaceholder")}
            width="100%"
            disabled={tailoring}
            aria-label={t("additionalPromptLabel")}
          />
        </Box>
        <Box display="flex" justifyContent="center">
          <Button
            text={
              tailoring
                ? t("tailoring")
                : tailoredBullets
                  ? t("tailorAgain")
                  : t("tailor")
            }
            icon="/icons/enhance.svg"
            type="button"
            size="md"
            kind="primary"
            disabled={tailoring || exportDataLoading}
            onClick={handleTailor}
          />
        </Box>
      </Box>

      {tailoring && <ProgressBar label={t("tailoring")} />}
      {tailorError && (
        <Typography variant="body" color="var(--error, #ef4444)">
          {tailorError}
        </Typography>
      )}

      {/* ── Tailored results ── */}
      {tailoredBullets && tailoredBullets.length > 0 && (
        <Box display="flex" flexDirection="column" gap={16} marginTop={4}>
          <Typography variant="body" color="var(--muted-foreground, #6b7280)">
            {t("tailoredSubtitle")}
          </Typography>
          <Typography variant="body" fontWeight={600}>
            {t("exportCustomizeTitle")}
          </Typography>
          <Grid container spacing={2}>
            {/* Contact / Links / Photo (global toggles) */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <Card
                display="flex"
                flexDirection="column"
                gap={10}
                height="100%"
              >
                <SwitchRow
                  label={t("exportIncludeContact")}
                  checked={includeContact}
                  onChange={setIncludeContact}
                />
                <SwitchRow
                  label={t("exportIncludeLinks")}
                  checked={includeLinks}
                  onChange={setIncludeLinks}
                />
                {profile?.profile_picture && (
                  <Box display="flex" flexDirection="column" gap={4}>
                    <SwitchRow
                      label={t("exportIncludePhoto")}
                      checked={includePhoto}
                      onChange={setIncludePhoto}
                    />
                    <Typography
                      variant="body"
                      color="var(--muted-foreground, #6b7280)"
                    >
                      {t("exportIncludePhotoHint")}
                    </Typography>
                  </Box>
                )}
              </Card>
            </Grid>

            {/* Languages */}
            {exportData && exportData.languages.length > 0 && (
              <Grid size={{ xs: 12, sm: 6 }}>
                <Card gap={12} height="100%">
                  {exportData.languages.map((lang) => (
                    <SwitchRow
                      key={lang.id}
                      label={lang.name}
                      checked={includedLanguageIds.has(lang.id)}
                      onChange={(checked) =>
                        toggleId(setIncludedLanguageIds, lang.id, checked)
                      }
                    />
                  ))}
                </Card>
              </Grid>
            )}
          </Grid>

          {(professionalSummary || savedSummary) && (
            <TailoredEditableCard
              title={t("professionalSummaryLabel")}
              labels={editCardLabels}
              editable
              value={professionalSummary}
              onChange={setProfessionalSummary}
              rows={8}
              ariaLabel={t("professionalSummaryLabel")}
              micLanguage={micLang}
              buildEnhanceMessages={buildSummaryEnhance}
              enhanceWithOptions
              enhanceOptionsLabels={enhanceOptionsLabels}
              onSave={handleSaveSummary}
              saving={savingCard === "summary"}
              dirty={professionalSummary !== savedSummary}
            />
          )}
          {/* Technical Skills — section include switch + per-chip selection.
              Every Matrix skill is shown here; the chips the AI picked start
              selected, and the user confirms / adds / removes which skills to
              keep in the export. */}
          {exportData && exportData.skills.length > 0 && (
            <TailoredEditableCard
              title={t("tailoredSkillsTitle")}
              included={includeSkills}
              onIncludedChange={setIncludeSkills}
              includeLabel={t("exportIncludeItem")}
              labels={editCardLabels}
            >
              <Box display="flex" flexDirection="column" gap={12}>
                <Box display="flex" flexWrap="wrap" gap={8}>
                  {exportData.skills.map((skill) => {
                    const isIncluded = includedTailoredSkillIds.has(skill.id);
                    return (
                      <Button
                        key={skill.id}
                        text={skill.name}
                        type="button"
                        size="sm"
                        kind={isIncluded ? "primary" : undefined}
                        styles={{ opacity: isIncluded ? 1 : 0.55 }}
                        aria-pressed={isIncluded}
                        onClick={() =>
                          toggleId(
                            setIncludedTailoredSkillIds,
                            skill.id,
                            !isIncluded,
                          )
                        }
                      />
                    );
                  })}
                </Box>
                <Box display="flex" justifyContent="flex-end">
                  <Button
                    text={
                      savingCard === "skills"
                        ? editCardLabels.saving
                        : editCardLabels.save
                    }
                    type="button"
                    size="md"
                    kind="primary"
                    disabled={savingCard === "skills" || !skillsDirty}
                    onClick={handleSaveSkills}
                  />
                </Box>
              </Box>
            </TailoredEditableCard>
          )}

          {/* Tailored bullet categories — editable, one card per category */}
          {grouped.map(({ cat, bullets }) => {
            const orig = bullets.map((b) => b.tailored_text).join("\n");
            return (
              <TailoredEditableCard
                key={cat}
                title={t(`categories.${cat}`)}
                included={!excludedBulletCats.has(cat)}
                onIncludedChange={(v) =>
                  setExcludedBulletCats((prev) => {
                    const next = new Set(prev);
                    if (v) next.delete(cat);
                    else next.add(cat);
                    return next;
                  })
                }
                includeLabel={t("exportIncludeItem")}
                labels={editCardLabels}
                editable
                value={bulletEdits[cat] ?? orig}
                onChange={(v) =>
                  setBulletEdits((prev) => ({ ...prev, [cat]: v }))
                }
                rows={5}
                ariaLabel={t(`categories.${cat}`)}
                micLanguage={micLang}
                buildEnhanceMessages={buildBulletEnhance}
                enhanceWithOptions
                enhanceOptionsLabels={enhanceOptionsLabels}
                onSave={handleSaveBullets}
                saving={savingCard === "bullets"}
                dirty={(bulletEdits[cat] ?? orig) !== orig}
              />
            );
          })}

          {/* Tailored work experiences — full-width grid, cards xs=12 / md=6 */}
          {tailoredWorkExperiences && tailoredWorkExperiences.length > 0 && (
            <Box display="flex" flexDirection="column" gap={10}>
              <Typography
                variant="body"
                fontWeight={600}
                color="var(--foreground)"
              >
                {t("tailoredWorkExpTitle")}
              </Typography>
              <Grid container spacing={2}>
                {tailoredWorkExperiences.map((twe) => {
                  const we = exportData?.workExps.find((e) => e.id === twe.id);
                  const roleTitle = we ? `${we.title} - ${we.company}` : "";
                  const cardKey = `we:${twe.id}`;
                  return (
                    <Grid key={twe.id} size={{ xs: 12, md: 6 }}>
                      <TailoredEditableCard
                        title={roleTitle}
                        included={includedWorkExpIds.has(twe.id)}
                        onIncludedChange={(v) =>
                          toggleId(setIncludedWorkExpIds, twe.id, v)
                        }
                        includeLabel={t("exportIncludeItem")}
                        labels={editCardLabels}
                        editable
                        value={weEdits[twe.id] ?? twe.tailored_description}
                        onChange={(v) =>
                          setWeEdits((prev) => ({ ...prev, [twe.id]: v }))
                        }
                        rows={6}
                        ariaLabel={roleTitle || t("tailoredWorkExpTitle")}
                        micLanguage={micLang}
                        buildEnhanceMessages={buildDescriptionEnhance}
                        enhanceWithOptions
                        enhanceOptionsLabels={enhanceOptionsLabels}
                        onSave={() => handleSaveWorkExperiences(cardKey)}
                        saving={savingCard === cardKey}
                        dirty={weDirty(twe)}
                      />
                    </Grid>
                  );
                })}
              </Grid>
            </Box>
          )}

          {/* Tailored projects — full-width grid, cards xs=12 / md=6 */}
          {tailoredProjects && tailoredProjects.length > 0 && (
            <Box display="flex" flexDirection="column" gap={10}>
              <Typography
                variant="body"
                fontWeight={600}
                color="var(--foreground)"
              >
                {t("tailoredProjectsTitle")}
              </Typography>
              <Grid container spacing={2}>
                {tailoredProjects.map((tp) => {
                  const proj = exportData?.projects.find((p) => p.id === tp.id);
                  const projName = proj ? proj.name : "";
                  const cardKey = `project:${tp.id}`;
                  return (
                    <Grid key={tp.id} size={{ xs: 12, md: 6 }}>
                      <TailoredEditableCard
                        title={projName}
                        included={includedProjectIds.has(tp.id)}
                        onIncludedChange={(v) =>
                          toggleId(setIncludedProjectIds, tp.id, v)
                        }
                        includeLabel={t("exportIncludeItem")}
                        labels={editCardLabels}
                        editable
                        value={projectEdits[tp.id] ?? tp.tailored_description}
                        onChange={(v) =>
                          setProjectEdits((prev) => ({
                            ...prev,
                            [tp.id]: v,
                          }))
                        }
                        rows={6}
                        ariaLabel={projName || t("tailoredProjectsTitle")}
                        micLanguage={micLang}
                        buildEnhanceMessages={buildDescriptionEnhance}
                        enhanceWithOptions
                        enhanceOptionsLabels={enhanceOptionsLabels}
                        onSave={() => handleSaveProjects(cardKey)}
                        saving={savingCard === cardKey}
                        dirty={projectDirty(tp)}
                      />
                    </Grid>
                  );
                })}
              </Grid>
            </Box>
          )}

          {/* Education — full-width, below the Work Experience / Projects grid */}
          {exportData && exportData.educations.length > 0 && (
            <Box display="flex" flexDirection="column" gap={8}>
              <Typography variant="body" fontWeight={600}>
                {t("exportEducationTitle")}
              </Typography>
              <Grid container spacing={2}>
                {exportData.educations.map((edu) => {
                  const isIncluded = includedEducationIds.has(edu.id);
                  return (
                    <Grid key={edu.id} size={{ xs: 12, sm: 6 }}>
                      <TailoredEditableCard
                        title={edu.institution}
                        included={isIncluded}
                        onIncludedChange={(checked) =>
                          toggleId(setIncludedEducationIds, edu.id, checked)
                        }
                        includeLabel={t("exportIncludeItem")}
                        labels={editCardLabels}
                      >
                        {edu.field_of_study && (
                          <Typography
                            variant="body"
                            color="var(--muted-foreground, #6b7280)"
                          >
                            {edu.field_of_study}
                          </Typography>
                        )}
                      </TailoredEditableCard>
                    </Grid>
                  );
                })}
              </Grid>
            </Box>
          )}

          {/* ── Export actions ── */}
          <Box
            display="flex"
            justifyContent="center"
            gap={10}
            flexWrap="wrap"
            marginTop={8}
          >
            <Button
              text={t("liveResume")}
              type="button"
              size="md"
              icon="/icons/fullscreen.svg"
              iconPosition="end"
              disabled={exportDataLoading || !exportData}
              onClick={openLiveResume}
              kind="primary"
            />
            <Button
              text={t("exportMarkdown")}
              type="button"
              size="md"
              disabled={exportDataLoading || !exportData}
              onClick={handleExportMarkdown}
              kind="primary"
            />
            <Button
              text={exportingPDF ? t("exportingPDF") : t("exportPDF")}
              type="button"
              size="md"
              kind="primary"
              disabled={exportingPDF || exportDataLoading || !exportData}
              onClick={handleExportPDF}
            />
          </Box>
          {exportError && (
            <Typography
              variant="body"
              color="var(--error, #ef4444)"
              marginTop={8}
              as="p"
            >
              {exportError}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}

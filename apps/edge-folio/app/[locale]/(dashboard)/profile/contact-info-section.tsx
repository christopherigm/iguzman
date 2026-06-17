"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Button } from "@repo/ui/core-elements/button";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { Select } from "@repo/ui/core-elements/select";
import { Toast } from "@repo/ui/core-elements/toast";
import { getProfile, updateContactInfo } from "@/lib/auth";
import { CITIZENSHIP_OPTIONS } from "@/lib/nafta-constants";

/**
 * ContactInfoPanel - phone, location, GitHub/LinkedIn URLs and citizenship.
 * Rendered as bare content; the caller supplies the surrounding card.
 */
export function ContactInfoPanel() {
  const t = useTranslations("ProfilePage");

  const [loading, setLoading] = useState(true);
  const [contactPhone, setContactPhone] = useState("");
  const [contactLocation, setContactLocation] = useState("");
  const [contactGithub, setContactGithub] = useState("");
  const [contactLinkedin, setContactLinkedin] = useState("");
  const [contactCitizenship, setContactCitizenship] = useState("");
  const [savingContact, setSavingContact] = useState(false);
  const [contactSuccess, setContactSuccess] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  useEffect(() => {
    getProfile()
      .then((p) => {
        setContactPhone(p.phone ?? "");
        setContactLocation(p.location ?? "");
        setContactGithub(p.github_url ?? "");
        setContactLinkedin(p.linkedin_url ?? "");
        setContactCitizenship(p.citizenship ?? "");
      })
      .catch(() => setContactError(t("errorLoad")))
      .finally(() => setLoading(false));
  }, [t]);

  const handleSaveContact = useCallback(async () => {
    setContactError(null);
    setContactSuccess(false);
    setSavingContact(true);
    try {
      await updateContactInfo({
        phone: contactPhone.trim(),
        location: contactLocation.trim(),
        github_url: contactGithub.trim(),
        linkedin_url: contactLinkedin.trim(),
        citizenship: contactCitizenship,
      });
      setContactSuccess(true);
    } catch {
      setContactError(t("contactError"));
    } finally {
      setSavingContact(false);
    }
  }, [
    contactPhone,
    contactLocation,
    contactGithub,
    contactLinkedin,
    contactCitizenship,
    t,
  ]);

  if (loading) {
    return <ProgressBar label={t("loading")} />;
  }

  return (
    <>
      {contactSuccess && (
        <Toast
          message={t("contactSaved")}
          variant="success"
          position="top-center"
        />
      )}
      {contactError && (
        <Toast message={contactError} variant="error" position="top-center" />
      )}

      <Box display="flex" flexDirection="column" gap={12} marginBottom={12}>
        <TextInput
          label={t("phoneLabel")}
          type="text"
          value={contactPhone}
          onChange={(v) => {
            setContactPhone(v);
            setContactSuccess(false);
          }}
          placeholder={t("phonePlaceholder")}
          aria-label={t("phoneLabel")}
        />
        <TextInput
          label={t("locationLabel")}
          type="text"
          value={contactLocation}
          onChange={(v) => {
            setContactLocation(v);
            setContactSuccess(false);
          }}
          placeholder={t("locationPlaceholder")}
          aria-label={t("locationLabel")}
        />
        <TextInput
          label={t("githubLabel")}
          type="url"
          value={contactGithub}
          onChange={(v) => {
            setContactGithub(v);
            setContactSuccess(false);
          }}
          placeholder={t("githubPlaceholder")}
          aria-label={t("githubLabel")}
        />
        <TextInput
          label={t("linkedinLabel")}
          type="url"
          value={contactLinkedin}
          onChange={(v) => {
            setContactLinkedin(v);
            setContactSuccess(false);
          }}
          placeholder={t("linkedinPlaceholder")}
          aria-label={t("linkedinLabel")}
        />
        <Select
          label={t("citizenshipLabel")}
          value={contactCitizenship}
          onChange={(v) => {
            setContactCitizenship(v);
            setContactSuccess(false);
          }}
          options={[
            { value: "", label: t("citizenshipPlaceholder") },
            ...CITIZENSHIP_OPTIONS,
          ]}
          aria-label={t("citizenshipLabel")}
        />
      </Box>
      {savingContact && <ProgressBar label={t("savingContact")} />}
      <Box display="flex" justifyContent="flex-end">
        <Button
          text={savingContact ? t("savingContact") : t("saveContact")}
          type="button"
          size="lg"
          kind="success"
          disabled={savingContact}
          onClick={() => void handleSaveContact()}
        />
      </Box>
    </>
  );
}

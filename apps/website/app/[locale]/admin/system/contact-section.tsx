"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Select } from "@repo/ui/core-elements/select";
import { Button } from "@repo/ui/core-elements/button";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import type { SocialLink } from "@/lib/contact";

/** The platforms the shared `SocialLinks` renders a branded icon for. */
const PLATFORMS = [
  "instagram",
  "facebook",
  "x",
  "tiktok",
  "youtube",
  "linkedin",
  "whatsapp",
  "website",
];

interface ContactSectionProps {
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

/**
 * Site-wide contact details in the System CMS: the public contact email and the
 * ordered list of social links (each a `{platform, url}` pair). Physical
 * locations live in their own /admin/branches section, not here.
 */
export function ContactSection({ values, onChange }: ContactSectionProps) {
  const t = useTranslations("Admin");
  const links = (values.social_links as SocialLink[] | undefined) ?? [];

  const platformOptions = PLATFORMS.map((p) => ({
    value: p,
    label: t(`social_${p}`),
  }));

  const updateLink = (index: number, patch: Partial<SocialLink>) => {
    const next = links.map((l, i) => (i === index ? { ...l, ...patch } : l));
    onChange("social_links", next);
  };
  const addLink = () =>
    onChange("social_links", [...links, { platform: "instagram", url: "" }]);
  const removeLink = (index: number) =>
    onChange(
      "social_links",
      links.filter((_, i) => i !== index),
    );

  return (
    <Box flexDirection="column" gap={16} paddingTop={32}>
      <Typography as="h2" variant="h4" margin={0}>
        {t("contactSection")}
      </Typography>
      <Typography variant="body" color="var(--muted-foreground, #6b7280)">
        {t("contactSectionDesc")}
      </Typography>

      <TextInput
        label={t("contactEmail")}
        type="email"
        value={String(values.contact_email ?? "")}
        onChange={(v) => onChange("contact_email", v)}
      />

      <Box flexDirection="column" gap={8}>
        <Typography variant="label">{t("socialLinks")}</Typography>
        {links.map((link, index) => (
          <Box key={index} gap={8} alignItems="flex-end" flexWrap="wrap">
            <Box minWidth={160}>
              <Select
                label={t("socialPlatform")}
                value={link.platform}
                onChange={(v) => updateLink(index, { platform: v })}
                options={platformOptions}
              />
            </Box>
            <Box flex="1" minWidth={200}>
              <TextInput
                label={t("socialUrl")}
                type="url"
                value={link.url}
                onChange={(v) => updateLink(index, { url: v })}
              />
            </Box>
            <IconButton
              icon="/icons/delete-trash-icon.svg"
              kind="error"
              size="md"
              aria-label={t("delete")}
              title={t("delete")}
              onClick={() => removeLink(index)}
            />
          </Box>
        ))}
        <Box>
          <Button
            text={`+ ${t("addSocialLink")}`}
            size="sm"
            onClick={addLink}
            type="button"
          />
        </Box>
      </Box>
    </Box>
  );
}

export default ContactSection;

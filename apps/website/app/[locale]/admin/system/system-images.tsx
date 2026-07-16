"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import {
  AdminImageUploader,
  type NewImage,
} from "@/components/admin-image-uploader/admin-image-uploader";
import {
  BRAND_IMAGE_FIELDS,
  MANIFEST_IMAGE_FIELDS,
  isLogoDerivedField,
  type SystemImageField,
} from "./system-image-fields";
import "./system-images.css";

export interface SystemImageState {
  existing: { id: number; url: string }[];
  pending: NewImage[];
}

interface SystemImagesProps {
  images: Record<string, SystemImageState>;
  onImageChange: (
    field: string,
    newImages: NewImage[],
    orderedExistingIds: number[],
  ) => void;
  /**
   * Bumped after logo-derived assets are generated; folded into the derived
   * uploaders' keys so they re-mount and pick up the new previews.
   */
  derivedImageKey: number;
}

export function SystemImages({
  images,
  onImageChange,
  derivedImageKey,
}: SystemImagesProps) {
  const t = useTranslations("Admin");

  const labels: Record<SystemImageField, string> = {
    img_logo: t("logo"),
    img_logo_hero: t("logoHero"),
    img_favicon: t("favicon"),
    img_hero: t("heroImage"),
    img_about: t("aboutImage"),
    img_manifest_1080: t("manifestIcon", { size: "1080×" }),
    img_manifest_512: t("manifestIcon", { size: "512×" }),
    img_manifest_256: t("manifestIcon", { size: "256×" }),
    img_manifest_192: t("manifestIcon", { size: "192×" }),
    img_manifest_128: t("manifestIcon", { size: "128×" }),
  };

  const renderRow = (fields: readonly SystemImageField[]) => (
    <Box className="si__grid">
      {fields.map((field) => (
        <Box key={field} flexDirection="column" gap={8}>
          <Typography variant="label">{labels[field]}</Typography>
          <AdminImageUploader
            key={
              isLogoDerivedField(field) ? `${field}-${derivedImageKey}` : field
            }
            existingImages={images[field]?.existing ?? []}
            onChange={(newImages, _deletedIds, orderedExistingIds) =>
              onImageChange(field, newImages, orderedExistingIds)
            }
            maxImages={1}
            compact
          />
        </Box>
      ))}
    </Box>
  );

  return (
    <>
      <Box flexDirection="column" gap={10}>
        <Typography variant="label" fontWeight={700}>
          {t("brandImages")}
        </Typography>
        {renderRow(BRAND_IMAGE_FIELDS)}
      </Box>
      <Box flexDirection="column" gap={10}>
        <Typography variant="label" fontWeight={700}>
          {t("manifestImages")}
        </Typography>
        {renderRow(MANIFEST_IMAGE_FIELDS)}
      </Box>
    </>
  );
}

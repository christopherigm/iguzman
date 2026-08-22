"use client";

import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { AdminImageUploader } from "@/components/admin-image-uploader/admin-image-uploader";
import { ImageWebSearch } from "@/components/admin/image-web-search";
import type { AdminImageField as ImageFieldState } from "@/hooks/use-admin-image-field";

type Props = {
  /** The field's own heading ("Image", "Cover Image", "Logo"…). */
  label: string;
  /** From `useAdminImageField()` - the uploader and the picker share it. */
  field: ImageFieldState;
  /**
   * Prefills the picker's query, normally the record's name. The picker follows
   * it until the operator types their own search.
   */
  query: string;
  /**
   * Rendered between the label and the drop zone - today the Image frame
   * select, which states a fact about the whole field and so belongs at its
   * head rather than under the picker at its foot.
   */
  afterLabel?: React.ReactNode;
};

/**
 * A record's single-image field: the drop zone, and under it the stock-image
 * picker that fills the same slot from a free photo bank.
 *
 * One component rather than a copy per form, because the two controls are one
 * field with two doors and the rule joining them is easy to get subtly wrong -
 * `useAdminImageField` documents it. Every CMS form with a single image renders
 * this; the gallery fields (products, menu items, the two editorial galleries)
 * keep their own uploader and pass the picker a slot count instead.
 */
export function AdminImageField({ label, field, query, afterLabel }: Props) {
  return (
    <Box display="flex" flexDirection="column" gap="8px">
      <Typography variant="label">{label}</Typography>
      {afterLabel}
      <AdminImageUploader
        key={field.uploaderKey}
        existingImages={field.existing}
        onChange={field.onUploaderChange}
        maxImages={1}
      />
      <ImageWebSearch
        defaultQuery={query}
        value={field.picked}
        onChange={field.onPick}
      />
    </Box>
  );
}

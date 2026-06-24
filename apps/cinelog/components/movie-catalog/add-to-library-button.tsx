"use client";

import { type MouseEvent, useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { Toast } from "@repo/ui/core-elements/toast";
import {
  addToLibrary,
  type MovieDetail,
  type MovieFormat,
} from "@/lib/catalog";
import { FORMAT_BUTTONS } from "@/components/format-buttons";

type OwnableFormat = Exclude<MovieFormat, "">;

type Props = {
  movieId: number;
  /** Movie title, shown in the confirmation prompt. */
  movieTitle: string;
  /** IconButton size; cards use "sm", the detail header uses "md". */
  size?: "sm" | "md" | "lg";
  translucent?: boolean;
  /** Called with the updated movie after a successful add (e.g. to flip `owned`). */
  onAdded?: (movie: MovieDetail) => void;
};

/**
 * Adds an existing catalog movie to the signed-in user's library. Renders an
 * icon button that opens a confirmation modal with a single-format picker; on
 * confirm it records ownership in the chosen format. The caller decides whether
 * to render it (it should be shown only to a logged-in user who doesn't already
 * own the movie). Shared by the catalog card and the movie detail page.
 */
export function AddToLibraryButton({
  movieId,
  movieTitle,
  size = "md",
  translucent = false,
  onAdded,
}: Props) {
  const t = useTranslations("CatalogPage");
  const tFormat = useTranslations("MovieFormat");
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<OwnableFormat | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [added, setAdded] = useState(false);

  // After a successful add, hide the trigger - grid cards don't refetch, so this
  // keeps the just-added card consistent. The detail page also flips `owned` via
  // onAdded, which removes this control on its next render.
  if (added) return null;

  async function handleConfirm() {
    if (!format || saving) return;
    setSaving(true);
    setError(false);
    try {
      const movie = await addToLibrary(movieId, format);
      setOpen(false);
      setAdded(true);
      onAdded?.(movie);
    } catch {
      setError(true);
      setSaving(false);
    }
  }

  function handleCancel() {
    if (saving) return;
    setOpen(false);
    setFormat("");
    setError(false);
  }

  function handleOpen(e: MouseEvent) {
    // Cards wrap their contents in a Link; don't navigate when adding.
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  }

  // The modal/toast render through a portal, but React events still bubble up
  // the component tree - which, on a catalog card, runs through the wrapping
  // Link. Swallow clicks here so confirming/cancelling never navigates.
  function stopBubble(e: MouseEvent) {
    e.stopPropagation();
  }

  return (
    <>
      <IconButton
        icon="/icons/add.svg"
        aria-label={t("addToLibrary")}
        title={t("addToLibrary")}
        kind="primary"
        size={size}
        onClick={handleOpen}
        translucent={translucent}
      />

      {open && (
        <Box onClick={stopBubble} styles={{ display: "contents" }}>
          <ConfirmationModal
            title={t("addToLibraryTitle")}
            text={t("addToLibraryText", { title: movieTitle })}
            okCallback={handleConfirm}
            cancelCallback={handleCancel}
            okDisabled={!format || saving}
          >
            <Box display="flex" flexDirection="column" gap={8}>
              <Typography variant="caption" styles={{ opacity: 0.7 }}>
                {t("formatLabel")}
              </Typography>
              <Box display="flex" gap={8} alignItems="center" flexWrap="wrap">
                {FORMAT_BUTTONS.map(({ value, icon, iconColor, fullColor }) => {
                  const selected = format === value;
                  return (
                    <IconButton
                      key={value}
                      icon={icon}
                      iconColor={iconColor}
                      kind={selected ? "primary" : "default"}
                      aria-label={tFormat(value)}
                      aria-pressed={selected}
                      title={tFormat(value)}
                      size="md"
                      onClick={() => setFormat(value)}
                      fullColor={fullColor}
                      solid={selected}
                      disabled={saving}
                    />
                  );
                })}
              </Box>
            </Box>
          </ConfirmationModal>
        </Box>
      )}

      {error && (
        <Box onClick={stopBubble} styles={{ display: "contents" }}>
          <Toast
            message={t("addToLibraryError")}
            variant="error"
            position="top-center"
          />
        </Box>
      )}
    </>
  );
}

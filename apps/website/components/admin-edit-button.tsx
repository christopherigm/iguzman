"use client";

import { useRouter } from "@repo/i18n/navigation";
import { IconButton } from "@repo/ui/core-elements/icon-button";

interface AdminEditButtonProps {
  /** Admin edit route, e.g. `/admin/products/12`. Locale is added by the router. */
  href: string;
  /** Accessible label / tooltip - the caller passes the translated "Edit" text. */
  label: string;
  /** Box size. Defaults to `md`, matching the share/favorite actions it sits by. */
  size?: "sm" | "md" | "lg";
  /** Filled, high-emphasis look - use when the button floats over an image. */
  solid?: boolean;
  /** Backdrop blur for translucent surfaces (e.g. over a hero). */
  translucent?: boolean;
}

/**
 * Admin-only shortcut from a public page to that record's admin edit form.
 *
 * Rendered only where the viewer is an admin (the caller gates on `is_admin`).
 * It navigates on click rather than via an `href` anchor so it can live inside a
 * card that is itself a link: the handler swallows the click - preventing the
 * card's own navigation - and pushes the admin route through the i18n router,
 * which prefixes the active locale.
 */
export function AdminEditButton({
  href,
  label,
  size = "md",
  solid = false,
  translucent = false,
}: AdminEditButtonProps) {
  const router = useRouter();

  return (
    <IconButton
      icon="/icons/edit.svg"
      aria-label={label}
      title={label}
      size={size}
      kind="primary"
      solid={solid}
      translucent={translucent}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        router.push(href);
      }}
    />
  );
}

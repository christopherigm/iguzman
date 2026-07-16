"use client";

import React, { useEffect, useState } from "react";
import { IconButton, type IconButtonProps } from "./icon-button";
import { Toast } from "./toast";

export interface ShareButtonProps extends Omit<
  IconButtonProps,
  "icon" | "aria-label" | "onClick" | "title"
> {
  /** Item name - the share sheet's title. The tooltip comes from `label`. */
  title: string;
  /** Short blurb for the share sheet; falls back to the title when empty. */
  text?: string;
  /** Accessible label / tooltip for the button. */
  label: string;
  /** Toast message shown when the URL was copied instead of shared. */
  copiedLabel: string;
  /** Shared target. Defaults to the current page URL. */
  url?: string;
  /** SVG path for the share icon. */
  icon?: string;
}

/**
 * Shares the current page. Prefers the device's native share sheet (mobile);
 * where that's unavailable (most desktops) it copies the canonical URL to the
 * clipboard and confirms with a toast. A user-cancelled share is a no-op.
 *
 * @example
 * <ShareButton
 *   title={movie.title}
 *   text={movie.synopsis}
 *   label={t('share')}
 *   copiedLabel={t('linkCopied')}
 *   size="md"
 *   translucent
 * />
 */
export const ShareButton: React.FC<ShareButtonProps> = ({
  title,
  text,
  label,
  copiedLabel,
  url,
  icon = "/icons/share.svg",
  kind = "success",
  ...iconButtonProps
}) => {
  const [linkCopied, setLinkCopied] = useState(false);

  // Auto-clear so a later share can re-trigger the toast.
  useEffect(() => {
    if (!linkCopied) return;
    const timer = setTimeout(() => setLinkCopied(false), 5000);
    return () => clearTimeout(timer);
  }, [linkCopied]);

  async function handleShare() {
    if (typeof window === "undefined") return;
    const shareUrl = url ?? window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title, text: text || title, url: shareUrl });
      } catch {
        // User dismissed the share sheet - nothing to do.
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setLinkCopied(true);
    } catch {
      // Clipboard blocked (e.g. insecure context) - silently skip.
    }
  }

  return (
    <>
      <IconButton
        {...iconButtonProps}
        icon={icon}
        aria-label={label}
        title={label}
        kind={kind}
        onClick={handleShare}
      />
      {linkCopied && (
        <Toast message={copiedLabel} variant="success" position="top-center" />
      )}
    </>
  );
};

export default ShareButton;

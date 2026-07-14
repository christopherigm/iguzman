"use client";

import { Typography } from "@repo/ui/core-elements/typography";

/**
 * The inline banners the auth surface shows above a submit button. Their own
 * module rather than exports of `auth-form` so the reset-password page and the
 * account page can use them without pulling the whole tabbed sign-in form into
 * those routes' bundles.
 *
 * Colour, padding and radius are props rather than a CSS class - see the repo's
 * props-first rule.
 */

type MessageProps = {
  message: string;
  /** The auth forms centre their banner; the account page's sections do not. */
  textAlign?: "left" | "center";
};

export function ErrorMessage({ message, textAlign = "left" }: MessageProps) {
  return (
    <Typography
      variant="caption"
      role="alert"
      color="var(--error, #ef4444)"
      backgroundColor="var(--error-bg, rgba(239, 68, 68, 0.08))"
      paddingX={12}
      paddingY={8}
      borderRadius={6}
      textAlign={textAlign}
    >
      {message}
    </Typography>
  );
}

export function SuccessMessage({ message, textAlign = "left" }: MessageProps) {
  return (
    <Typography
      variant="caption"
      color="var(--success, #22c55e)"
      backgroundColor="var(--success-bg, rgba(34, 197, 94, 0.08))"
      paddingX={12}
      paddingY={8}
      borderRadius={6}
      textAlign={textAlign}
    >
      {message}
    </Typography>
  );
}

'use client';

import Link from 'next/link';
import { CSSProperties } from 'react';

export interface LinkButtonProps {
  /** Visible text label (required). */
  label: string;
  /**
   * Navigation target. When provided the component renders as a Next.js
   * `<Link>` (with `prefetch`) so the destination page is pre-fetched.
   */
  href?: string;
  /**
   * Click handler. When provided (and no `href` is given) the component
   * renders as a plain `<button type="button">`.
   */
  onClick?: () => void;
  className?: string;
  id?: string;
}

const baseStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--muted-foreground, #6b7280)',
  fontSize: 13,
  cursor: 'pointer',
  textDecoration: 'underline',
  padding: 0,
};

/**
 * LinkButton — a lightweight text link that adapts to its usage:
 *
 * - Pass `href` to get a Next.js `<Link prefetch>` (page pre-fetching included).
 * - Pass `onClick` to get an accessible `<button>` styled as a link.
 *
 * @example
 * // Pre-fetched navigation
 * <LinkButton href="/auth#reset-password" label="Forgot your password?" />
 *
 * @example
 * // In-page action
 * <LinkButton onClick={() => switchTab('sign-up')} label="Don't have an account? Sign up" />
 */
export function LinkButton({ label, href, onClick, className, id }: LinkButtonProps) {
  if (href !== undefined) {
    return (
      <Link
        href={href}
        prefetch
        id={id}
        className={className}
        style={baseStyle}
      >
        {label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      id={id}
      className={className}
      onClick={onClick}
      style={baseStyle}
    >
      {label}
    </button>
  );
}

export default LinkButton;

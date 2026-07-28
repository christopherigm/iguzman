'use client';

import { usePathname } from '@repo/i18n/navigation';

/**
 * Renders its children on the public site but not inside the CMS.
 *
 * A client component because the decision is per-route and the layout that
 * renders it is shared by both - reading the pathname here is what lets the
 * watermark and the footer stay out of `/admin` without splitting the layout in
 * two. `usePathname` from `@repo/i18n/navigation` is already locale-stripped, so
 * this matches on every locale.
 */
export function HideOnAdmin({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return null;
  return <>{children}</>;
}

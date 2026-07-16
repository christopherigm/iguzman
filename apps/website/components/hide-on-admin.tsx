"use client";

import { usePathname } from "next/navigation";

type Props = {
  children: React.ReactNode;
};

/**
 * Renders its children on public routes only. The layout is a server component
 * and cannot read the pathname, so chrome that has no place in the CMS (footer,
 * dev site switcher) goes through this client gate.
 */
export function HideOnAdmin({ children }: Props) {
  const pathname = usePathname();
  if (pathname.includes("/admin")) return null;
  return <>{children}</>;
}

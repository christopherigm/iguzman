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

/**
 * Renders its children everywhere except the POS.
 *
 * A second gate rather than another clause inside `HideOnAdmin`, because the two
 * routes want opposite things from the same chrome: the CMS keeps the site
 * navbar (its layout even reserves the height), while the till - a full-screen
 * single-purpose tool with its own slim bar - drops it. Composed with
 * `HideOnAdmin` where a piece of chrome belongs on neither.
 *
 * Matched on the path *segment*, not `includes("/pos")`, which would also
 * swallow a customer page such as `/es/products/pos-terminal-stand`.
 */
export function HideOnPos({ children }: Props) {
  const pathname = usePathname();
  if (pathname.split("/").includes("pos")) return null;
  return <>{children}</>;
}

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
 * The staff screens that own the whole viewport and draw their own slim bar:
 * the till and the order board. Both are one-purpose tools used on a tablet at
 * a counter, and neither has any use for the site's chrome.
 */
const FULL_SCREEN_TOOL_SEGMENTS = ["pos", "order-board"];

/**
 * Renders its children everywhere except the full-screen staff tools.
 *
 * A second gate rather than another clause inside `HideOnAdmin`, because the
 * two kinds of route want opposite things from the same chrome: the CMS keeps
 * the site navbar (its layout even reserves the height), while a till or a
 * board drops it. Composed with `HideOnAdmin` where a piece of chrome belongs
 * on neither.
 *
 * Matched on the path *segment*, not `includes("/pos")`, which would also
 * swallow a customer page such as `/es/products/pos-terminal-stand`.
 */
export function HideOnFullScreenTool({ children }: Props) {
  const pathname = usePathname();
  const segments = pathname.split("/");
  if (FULL_SCREEN_TOOL_SEGMENTS.some((s) => segments.includes(s))) return null;
  return <>{children}</>;
}

"use client";

import { useRouter } from "next/navigation";
import { Box } from "@repo/ui/core-elements/box";
import { Select } from "@repo/ui/core-elements/select";
import type { SelectOption } from "@repo/ui/core-elements/select";

/**
 * Dev-only floating control to preview any registered site on
 * `127.0.0.1:3000`, where the request host matches no site and everything would
 * otherwise fall back to `_default`. Selecting a site writes the `__dev_site`
 * cookie (honored only in development by `lib/resolve-site.ts`) and refreshes;
 * "Default (by host)" clears it. Rendered only when `NODE_ENV === "development"`
 * (gated in the layout), so it never ships to production.
 */
export function DevSiteSwitcher({
  sites,
  current,
  cookieName,
  side = "left",
}: {
  sites: { slug: string; name: string }[];
  current: string;
  cookieName: string;
  /**
   * Which bottom corner to float in. The CMS keeps its own fixed sidebar down
   * the left edge, so `admin/layout.tsx` puts the switcher on the right there.
   */
  side?: "left" | "right";
}) {
  const router = useRouter();

  const options: SelectOption[] = [
    { value: "", label: "Default (by host)" },
    ...sites.map((s) => ({ value: s.slug, label: s.name })),
  ];

  const onChange = (slug: string) => {
    document.cookie = slug
      ? `${cookieName}=${slug}; path=/; max-age=31536000; samesite=lax`
      : `${cookieName}=; path=/; max-age=0; samesite=lax`;
    router.refresh();
  };

  return (
    <Box
      padding={8}
      borderRadius={8}
      border="1px solid var(--border)"
      backgroundColor="var(--surface-2)"
      elevation={6}
      styles={{
        position: "fixed",
        bottom: 16,
        [side]: 16,
        zIndex: 2000,
        width: 200,
      }}
    >
      <Select
        label="Dev site"
        value={current}
        onChange={onChange}
        options={options}
      />
    </Box>
  );
}

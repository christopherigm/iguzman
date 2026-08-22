"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSession } from "@repo/auth/session-provider";
import { getSystem } from "@/lib/admin-api";

interface SitePrefixValue {
  /** `System.site_prefix`, or `null` while the System is still loading. */
  prefix: string | null;
  /** Publish a prefix the operator just saved on /admin/system. */
  setPrefix: (value: string) => void;
}

const SitePrefixContext = createContext<SitePrefixValue>({
  prefix: null,
  setPrefix: () => {},
});

/**
 * Makes the tenant's slug namespace available to every CMS form, from one fetch.
 *
 * Eleven detail forms derive a new record's slug in the browser as the operator
 * types its name (`buildSlug`), so all eleven need `System.site_prefix`. Fetched
 * once here rather than in each form: the alternative is eleven `getSystem`
 * calls that all answer the same question, on pages that already fetch a list
 * and a category set of their own.
 *
 * ⚠ It reads `getSystem(session.systemId)`, **not** `lib/system.ts`'s
 * host-resolved `getSystem()`. The CMS always edits the tenant you signed in as
 * - `systemId` is a claim on the access token and Django re-derives it on every
 * write - while the host in development follows the dev site switcher. Resolving
 * by host here would paint one customer's prefix onto slugs saved to another's
 * catalog, which is the exact mismatch `DevTenantGuard` exists to catch.
 */
export function SitePrefixProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const systemId = useSession()?.systemId ?? 0;
  const [prefix, setPrefix] = useState<string | null>(null);

  useEffect(() => {
    if (!systemId) return;
    // Guarded rather than aborted: this resolves once per CMS session and the
    // only thing a late answer could do is set state on an unmounted tree.
    let alive = true;
    getSystem(systemId)
      .then((data) => {
        if (alive) setPrefix(String(data.site_prefix ?? ""));
      })
      // Swallowed on purpose. A form whose prefix never arrives simply does not
      // derive a slug (see `buildSlug`'s callers), which is the safe outcome -
      // the page's own `errorLoad` is what reports a failed record load.
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [systemId]);

  const value = useMemo<SitePrefixValue>(
    () => ({ prefix, setPrefix: (next: string) => setPrefix(next) }),
    [prefix],
  );

  return (
    <SitePrefixContext.Provider value={value}>
      {children}
    </SitePrefixContext.Provider>
  );
}

/**
 * The tenant's slug namespace, or `null` while it loads.
 *
 * ⚠ **A form must not build a slug from a null.** `buildSlug(name, "")` yields
 * `-latte`, which is a leading hyphen and no namespace at all - so every caller
 * guards on the value before deriving.
 */
export function useSitePrefix(): string | null {
  return useContext(SitePrefixContext).prefix;
}

/**
 * Publish a prefix the operator just saved, so forms opened afterwards build
 * slugs from the new one without a page reload. Only /admin/system calls this.
 */
export function useSetSitePrefix(): (value: string) => void {
  const { setPrefix } = useContext(SitePrefixContext);
  return useCallback((value: string) => setPrefix(value), [setPrefix]);
}

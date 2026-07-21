import { cookies } from "next/headers";
import { setRequestLocale } from "next-intl/server";
import { getSession } from "@repo/auth/session";
import { AdminSidebar } from "./admin-sidebar";
import { DevTenantGuard } from "./dev-tenant-guard";
import { DevSiteSwitcher } from "../dev-site-switcher";
import { DEV_SITE_COOKIE, SITE_CONFIGS } from "@/sites/registry";
import { getSystem } from "@/lib/system";
import { Box } from "@repo/ui/core-elements/box";
import Container from "@repo/ui/core-elements/container";
import "./admin-layout.css";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function AdminLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  // The root layout hides the site switcher on /admin, so it is rendered here
  // instead - the CMS is exactly where a mis-set `__dev_site` does damage, and
  // seeing (and being able to correct) the selection is the point.
  //
  // `getSession` and `getSystem` are both request-cached, so asking here costs
  // nothing on top of what the root layout already fetched. The mismatch is
  // real whenever the previewed site has a System of its own and it is not the
  // one on the token; a host that matches no System (127.0.0.1 with no cookie)
  // yields `null` and is left alone.
  const isDev = process.env.NODE_ENV === "development";
  const [session, system] = isDev
    ? await Promise.all([getSession(), getSystem()])
    : [null, null];
  const devSite = isDev
    ? ((await cookies()).get(DEV_SITE_COOKIE)?.value ?? "")
    : "";
  const mismatchedSite =
    session?.systemId && system && session.systemId !== system.id
      ? system.site_name
      : null;

  return (
    <>
      {/* Clear the fixed navbar via the shared @repo/ui CSS var, instead of
          importing the heavy "use client" navbar module for a spacer. */}
      <Box height="var(--ui-navbar-height, 57px)" />
      <Box className="admin-shell">
        <AdminSidebar />
        {/* `admin-content` is a styling hook only (see admin-layout.css): on
            xs/sm it lets the page's first <Breadcrumbs> become the fixed bar
            beside the "Admin Menu ☰" toggle. */}
        {/* paddingBottom: every admin page (lists, forms) otherwise ends flush
            against the bottom of the page with no breathing room. */}
        <Container
          className="admin-content"
          paddingX={10}
          marginTop={16}
          paddingBottom={40}
        >
          {children}
        </Container>
      </Box>
      {isDev && (
        <DevSiteSwitcher
          sites={SITE_CONFIGS.map((c) => ({ slug: c.slug, name: c.name }))}
          current={devSite}
          cookieName={DEV_SITE_COOKIE}
          side="right"
        />
      )}
      {mismatchedSite && <DevTenantGuard siteName={mismatchedSite} />}
    </>
  );
}

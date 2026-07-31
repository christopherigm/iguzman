"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@repo/i18n/navigation";
import { useSession } from "@repo/auth/session-provider";
import { Button } from "@repo/ui/core-elements/button";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import "./admin-sidebar.css";
import { ADMIN_NAV_ITEMS } from "./admin-nav-items";

/** Where the collapsed/expanded choice is remembered between page loads. */
const COLLAPSED_KEY = "admin-sidebar-collapsed";

/**
 * The collapsed choice lives in `localStorage` and is read through
 * `useSyncExternalStore` - not a `useEffect` + `setState`, which the repo's
 * react-hooks rules reject. The server snapshot is `false`, so the sidebar is
 * always rendered expanded on the server and switched to the stored value
 * immediately after hydration; the mirror below is what makes the client
 * snapshot referentially stable across renders.
 */
let collapsedCache: boolean | null = null;
const collapsedListeners = new Set<() => void>();

function getCollapsed(): boolean {
  if (collapsedCache === null) {
    collapsedCache = localStorage.getItem(COLLAPSED_KEY) === "true";
  }
  return collapsedCache;
}

function getCollapsedOnServer(): boolean {
  return false;
}

function subscribeToCollapsed(onChange: () => void): () => void {
  collapsedListeners.add(onChange);
  return () => {
    collapsedListeners.delete(onChange);
  };
}

function setCollapsed(next: boolean): void {
  collapsedCache = next;
  localStorage.setItem(COLLAPSED_KEY, String(next));
  collapsedListeners.forEach((notify) => notify());
}

export function AdminSidebar() {
  const t = useTranslations("Admin");
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // The rail state. Collapsing is a desktop affordance only: below `md` the
  // sidebar is a drawer, and the CSS keeps it full-width and labelled there.
  const collapsed = useSyncExternalStore(
    subscribeToCollapsed,
    getCollapsed,
    getCollapsedOnServer,
  );
  // The session is server-derived, so admin status is known during SSR - no more
  // null limbo while the client catches up. This only gates the sidebar UI:
  // proxy.ts guards the route and Django enforces the permission on every call.
  const authorized = useSession()?.isAdmin === true;

  useEffect(() => {
    if (!authorized) router.replace("/auth");
  }, [authorized, router]);

  if (!authorized) return null;
  if (pathname === "/admin") return null;

  return (
    <>
      <div
        className={`admin-sidebar__spacer${collapsed ? " admin-sidebar__spacer--collapsed" : ""}`}
        aria-hidden="true"
      />

      <Button
        unstyled
        className="admin-sidebar__toggle"
        onClick={() => setOpen((o) => !o)}
        aria-label={t("toggleSidebar")}
        aria-expanded={open}
      >
        <Typography
          as="span"
          variant="body"
          className="admin-sidebar__toggle-label"
        >
          {t("adminMenu")}
        </Typography>
        <span className="admin-sidebar__toggle-icon">{open ? "✕" : "☰"}</span>
      </Button>

      <nav
        className={`admin-sidebar ${open ? "admin-sidebar--open" : ""}${
          collapsed ? " admin-sidebar--collapsed" : ""
        }`}
        aria-label={t("navigation")}
      >
        <ul className="admin-sidebar__list">
          {ADMIN_NAV_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <li key={item.key} className="admin-sidebar__item">
                <Link
                  href={item.href}
                  prefetch
                  className={`admin-sidebar__link${active ? " admin-sidebar__link--active" : ""}`}
                  onClick={() => setOpen(false)}
                  /* Collapsed, the label is `display: none` and so leaves the
                     accessibility tree entirely - the link would be an unnamed
                     emoji. Naming it here covers both states, and the title is
                     the tooltip that identifies a bare icon. */
                  aria-label={t(item.key)}
                  title={t(item.key)}
                >
                  <span className="admin-sidebar__icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <Typography
                    as="span"
                    variant="body"
                    className="admin-sidebar__label"
                  >
                    {t(item.key)}
                  </Typography>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* `marginTop: auto` pins the title to the bottom of the flex column,
            so it reads as a footer whether the list is short or long. The
            collapse control sits at its right end - the one place in the
            sidebar that is always on screen however long the list has grown. */}
        <Box
          marginTop="auto"
          padding="12px 16px 20px"
          alignItems="center"
          justifyContent="space-between"
          gap={8}
          styles={{
            borderTop:
              "1px solid color-mix(in srgb, var(--foreground) 10%, transparent)",
          }}
        >
          <Typography
            as="span"
            variant="label"
            fontWeight={700}
            color="var(--foreground)"
            className="admin-sidebar__title"
            /* 11px: below the `label` variant's 12px, no matching variant */
            styles={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              whiteSpace: "nowrap",
            }}
          >
            {t("title")}
          </Typography>

          {/* Wrapped rather than classed directly: `IconButton` sets its own
              `display: inline-flex` inline, which a `display: none` in a CSS
              class can never win against. A bare `Box` sets no display of its
              own, so the media query below `md` can hide it. */}
          <Box className="admin-sidebar__collapse">
            <IconButton
              icon={collapsed ? "/icons/next.svg" : "/icons/prev.svg"}
              size="sm"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? t("expandSidebar") : t("collapseSidebar")}
              title={collapsed ? t("expandSidebar") : t("collapseSidebar")}
              aria-expanded={!collapsed}
            />
          </Box>
        </Box>
      </nav>

      {open && (
        <Box
          className="admin-sidebar__overlay"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}

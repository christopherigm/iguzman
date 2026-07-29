"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@repo/i18n/navigation";
import { useSession } from "@repo/auth/session-provider";
import { Button } from "@repo/ui/core-elements/button";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import "./admin-sidebar.css";
import { ADMIN_NAV_ITEMS } from "./admin-nav-items";

export function AdminSidebar() {
  const t = useTranslations("Admin");
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // The session is server-derived, so admin status is known during SSR - there
  // is no null limbo while the client catches up. This gates the sidebar UI
  // only: `proxy.ts` keeps anonymous visitors off `/admin` and Django enforces
  // the permission on every call (core/permissions.py).
  const authorized = useSession()?.isAdmin === true;

  useEffect(() => {
    if (!authorized) router.replace("/auth");
  }, [authorized, router]);

  if (!authorized) return null;
  // The CMS home page is the card grid; a sidebar beside it would list the same
  // links twice.
  if (pathname === "/admin") return null;

  return (
    <>
      <div className="admin-sidebar__spacer" aria-hidden="true" />

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
        className={`admin-sidebar ${open ? "admin-sidebar--open" : ""}`}
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

        {/* `marginTop: auto` pins the title to the bottom of the flex column, so
            it reads as a footer whether the list is short or long. */}
        <Box
          marginTop="auto"
          padding="12px 16px 20px"
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
            /* 11px: below the `label` variant's 12px, no matching variant */
            styles={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {t("title")}
          </Typography>
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

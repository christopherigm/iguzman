'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@repo/i18n/navigation';
import Link from 'next/link';
import { getUserFromToken, getAccessToken } from '@/lib/auth';
import { Button } from '@repo/ui/core-elements/button';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import './admin-sidebar.css';
import { ADMIN_NAV_ITEMS } from './admin-nav-items';

export function AdminSidebar() {
  const t = useTranslations('Admin');
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    const user = getUserFromToken();
    if (!token || !user?.isAdmin) {
      router.replace('/auth');
      setAuthorized(false);
    } else {
      setAuthorized(true);
    }
  }, [router]);

  if (authorized === null) return null; // loading
  if (!authorized) return null;
  if (pathname === '/admin') return null;

  return (
    <>
      <div className="admin-sidebar__spacer" aria-hidden="true" />

      <Button
        unstyled
        className="admin-sidebar__toggle"
        onClick={() => setOpen(o => !o)}
        aria-label={t('toggleSidebar')}
        aria-expanded={open}
      >
        <span className="admin-sidebar__toggle-icon">{open ? '✕' : '☰'}</span>
        <Typography as="span" variant="body-sm" className="admin-sidebar__toggle-label">{t('menu')}</Typography>
      </Button>

      <nav className={`admin-sidebar ${open ? 'admin-sidebar--open' : ''}`} aria-label={t('navigation')}>
        <Box className="admin-sidebar__header">
          <Typography as="span" variant="label" className="admin-sidebar__title">{t('title')}</Typography>
        </Box>
        <ul className="admin-sidebar__list">
          {ADMIN_NAV_ITEMS.map(item => {
            const active = pathname.startsWith(item.href);
            return (
              <li key={item.key} className="admin-sidebar__item">
                <Link
                  href={item.href}
                  prefetch
                  className={`admin-sidebar__link${active ? ' admin-sidebar__link--active' : ''}`}
                  onClick={() => setOpen(false)}
                >
                  <span className="admin-sidebar__icon" aria-hidden="true">{item.icon}</span>
                  <Typography as="span" variant="body-sm" className="admin-sidebar__label">{t(item.key)}</Typography>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {open && <Box className="admin-sidebar__overlay" onClick={() => setOpen(false)} />}
    </>
  );
}

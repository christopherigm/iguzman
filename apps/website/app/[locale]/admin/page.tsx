'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Grid } from '@repo/ui/core-elements/grid';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { getUserFromToken } from '@/lib/auth';
import './admin-home.css';
import { ADMIN_NAV_ITEMS } from './admin-nav-items';

const MAX_NAME_LENGTH = 20;

function trimName(name: string): string {
  return name.length > MAX_NAME_LENGTH
    ? name.slice(0, MAX_NAME_LENGTH) + '…'
    : name;
}

export default function AdminPage() {
  const t = useTranslations('Admin');
  const [username, setUsername] = useState(t('breadcrumbAdmin'));

  useEffect(() => {
    const user = getUserFromToken();
    const rawName = user?.firstName ?? user?.email ?? t('breadcrumbAdmin');
    setUsername(trimName(rawName));
  }, [t]);

  return (
    <Box className="admin-home">
      <Box className="admin-home__header">
        <Typography as="h1" variant="h2" className="admin-home__title">
          {t('welcome', { username })}
        </Typography>
        <Typography variant="body" className="admin-home__subtitle">
          {t('welcomeSubtitle')}
        </Typography>
      </Box>

      <Grid container spacing={1}>
        {ADMIN_NAV_ITEMS.map((item) => (
          <Grid key={item.key} size={{ xs: 6, sm: 4, md: 3 }}>
            <Link href={item.href} prefetch className="admin-home__card">
              <span className="admin-home__icon" aria-hidden="true">
                {item.icon}
              </span>
              <Typography
                as="span"
                variant="label"
                className="admin-home__name"
              >
                {t(item.key)}
              </Typography>
              <Typography as="p" variant="body-sm" className="admin-home__desc">
                {t(item.descKey)}
              </Typography>
            </Link>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

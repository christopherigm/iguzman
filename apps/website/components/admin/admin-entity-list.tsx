'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import './admin-entity-list.css';
import Image from 'next/image';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Button } from '@repo/ui/core-elements/button';
import { Badge } from '@repo/ui/core-elements/badge';

export interface Column {
  key: string;
  label: string;
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
}

interface AdminEntityListProps {
  title: string;
  items: Record<string, unknown>[];
  columns: Column[];
  basePath: string;
  onDelete?: (id: number) => void;
  loading?: boolean;
  error?: string | null;
}

export function AdminEntityList({
  title,
  items,
  columns,
  basePath,
  onDelete,
  loading,
  error,
}: AdminEntityListProps) {
  const t = useTranslations('Admin');

  return (
    <Box flexDirection="column" gap={20}>
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        gap={16}
        flexWrap="wrap"
      >
        <Typography as="h1" variant="h3" className="ael__title">
          {title}
        </Typography>
        <Link href={`${basePath}/new`} prefetch>
          <Button text={`+ ${t('newItem')}`} />
        </Link>
      </Box>

      {loading && (
        <Box className="ael__state">
          <Typography variant="body">{t('loading')}</Typography>
        </Box>
      )}

      {error && (
        <Box className="ael__state ael__state--error">
          <Typography variant="body">{error}</Typography>
        </Box>
      )}

      {!loading && !error && items.length === 0 && (
        <Box className="ael__state">
          <Typography variant="body">{t('noItems')}</Typography>
        </Box>
      )}

      {!loading && !error && items.length > 0 && (
        <Box className="ael__table-wrap">
          <table className="ael__table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key} className="ael__th">
                    {col.label}
                  </th>
                ))}
                <th className="ael__th ael__th--actions">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={String(item.id)} className="ael__row">
                  {columns.map((col) => (
                    <td key={col.key} className="ael__td">
                      {col.render
                        ? col.render(item[col.key], item)
                        : renderCell(item[col.key])}
                    </td>
                  ))}
                  <td className="ael__td ael__td--actions">
                    <Link href={`${basePath}/${item.id}`} prefetch>
                      <Button
                        text={t('edit')}
                        unstyled
                        className="ael__btn-edit"
                      />
                    </Link>
                    {onDelete && (
                      <Button
                        text={t('delete')}
                        unstyled
                        className="ael__btn-delete"
                        onClick={() => {
                          if (window.confirm(t('confirmDelete'))) {
                            onDelete(item.id as number);
                          }
                        }}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      )}
    </Box>
  );
}

function renderCell(value: unknown): React.ReactNode {
  if (value === null || value === undefined)
    return (
      <Typography as="span" variant="body-sm" className="ael__null">
        —
      </Typography>
    );
  if (typeof value === 'boolean') {
    return (
      <Badge variant="subtle" color={value ? 'green' : 'gray'}>
        {value ? '✓' : '✗'}
      </Badge>
    );
  }
  if (
    typeof value === 'string' &&
    (value.startsWith('http://') || value.startsWith('https://'))
  ) {
    // Detect image URLs
    if (/\.(jpg|jpeg|png|webp|gif|svg)(\?|$)/i.test(value)) {
      return (
        <Box className="ael__thumb-wrap">
          <Image
            src={value}
            alt=""
            width={40}
            height={40}
            className="ael__thumb"
            unoptimized
          />
        </Box>
      );
    }
  }
  if (typeof value === 'string' && value.length > 60) {
    return (
      <Typography
        as="span"
        variant="body-sm"
        className="ael__truncated"
        title={value}
      >
        {value.slice(0, 60)}…
      </Typography>
    );
  }
  return String(value);
}

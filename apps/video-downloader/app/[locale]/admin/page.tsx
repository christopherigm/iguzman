import { getTranslations } from 'next-intl/server';
import { Box } from '@repo/ui/core-elements/box';
import { Container } from '@repo/ui/core-elements/container';
import { Grid } from '@repo/ui/core-elements/grid';
import { Typography } from '@repo/ui/core-elements/typography';
import { ThemeSwitch } from '@repo/ui/theme-switch';
import { getAllTasks } from '@/lib/video-task-db';
import type { TaskStatus } from '@/lib/types';
import { AdminTaskTable } from './admin-task-table';

export const dynamic = 'force-dynamic';

const STATUS_COLORS: Record<TaskStatus, string> = {
  pending: '#999',
  downloading: '#06b6d4',
  done: '#22c55e',
  error: '#ef4444',
};

export default async function AdminPage() {
  const t = await getTranslations('Admin');
  const tasks = await getAllTasks(500);

  const total = tasks.length;
  const counts: Record<TaskStatus, number> = {
    pending: 0,
    downloading: 0,
    done: 0,
    error: 0,
  };
  for (const task of tasks) {
    counts[task.status] = (counts[task.status] ?? 0) + 1;
  }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentCount = tasks.filter((task) => task.updatedAt >= oneDayAgo).length;

  const statCards: { label: string; value: number; color: string }[] = [
    { label: t('statTotal'), value: total, color: 'var(--accent, #68c3f7)' },
    { label: t('statPending'), value: counts.pending, color: STATUS_COLORS.pending },
    {
      label: t('statDownloading'),
      value: counts.downloading,
      color: STATUS_COLORS.downloading,
    },
    { label: t('statDone'), value: counts.done, color: STATUS_COLORS.done },
    { label: t('statErrors'), value: counts.error, color: STATUS_COLORS.error },
    { label: t('statLast24h'), value: recentCount, color: 'var(--accent, #68c3f7)' },
  ];

  return (
    <Container size="xl" paddingX={16}>
      <Box className="admin-header">
        <Typography as="h1" variant="h1" className="admin-title">{t('title')}</Typography>
        <ThemeSwitch />
      </Box>

      <Grid container spacing={2}>
        {statCards.map((card) => (
          <Grid key={card.label} size={{ xs: 6, sm: 4, md: 2 }}>
            <Box className="admin-stat-card">
              <Typography variant="body" className="admin-stat-value" color={card.color}>
                {card.value}
              </Typography>
              <Typography variant="label" className="admin-stat-label">{card.label}</Typography>
            </Box>
          </Grid>
        ))}
      </Grid>

      <AdminTaskTable tasks={JSON.parse(JSON.stringify(tasks))} />
    </Container>
  );
}

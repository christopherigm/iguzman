import { Container } from '@repo/ui/core-elements/container';
import { Grid } from '@repo/ui/core-elements/grid';
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
  const tasks = await getAllTasks();

  const total = tasks.length;
  const counts: Record<TaskStatus, number> = {
    pending: 0,
    downloading: 0,
    done: 0,
    error: 0,
  };
  for (const t of tasks) {
    counts[t.status] = (counts[t.status] ?? 0) + 1;
  }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentCount = tasks.filter((t) => t.updatedAt >= oneDayAgo).length;

  const statCards: { label: string; value: number; color: string }[] = [
    { label: 'Total', value: total, color: 'var(--accent, #68c3f7)' },
    { label: 'Pending', value: counts.pending, color: STATUS_COLORS.pending },
    {
      label: 'Downloading',
      value: counts.downloading,
      color: STATUS_COLORS.downloading,
    },
    { label: 'Done', value: counts.done, color: STATUS_COLORS.done },
    { label: 'Errors', value: counts.error, color: STATUS_COLORS.error },
    { label: 'Last 24h', value: recentCount, color: 'var(--accent, #68c3f7)' },
  ];

  return (
    <Container size="xl" paddingX={16}>
      <div className="admin-header">
        <h1 className="admin-title">Admin Dashboard</h1>
        <ThemeSwitch />
      </div>

      <Grid container spacing={2}>
        {statCards.map((card) => (
          <Grid key={card.label} size={{ xs: 6, sm: 4, md: 2 }}>
            <div className="admin-stat-card">
              <span className="admin-stat-value" style={{ color: card.color }}>
                {card.value}
              </span>
              <span className="admin-stat-label">{card.label}</span>
            </div>
          </Grid>
        ))}
      </Grid>

      <AdminTaskTable tasks={JSON.parse(JSON.stringify(tasks))} />
    </Container>
  );
}

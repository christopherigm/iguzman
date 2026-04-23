'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Badge } from '@repo/ui/core-elements/badge';
import type { TaskStatus } from '@/lib/types';

const STATUS_COLORS: Record<TaskStatus, string> = {
  pending: '#999',
  downloading: '#06b6d4',
  processing: '#3b82f6',
  converting: '#f59e0b',
  burning: '#a855f7',
  translating: '#ec4899',
  done: '#22c55e',
  error: '#ef4444',
};

type SortField = 'status' | 'name' | 'createdAt' | 'updatedAt' | 'duration';
type SortDir = 'asc' | 'desc';

interface SerializedTask {
  _id: string;
  url: string;
  justAudio: boolean;
  status: TaskStatus;
  file: string | null;
  name: string | null;
  isH265: boolean | null;
  duration: number | null;
  uploader: string | null;
  error: { code: string; message: string } | null;
  createdAt: string;
  updatedAt: string;
}

interface AdminTaskTableProps {
  tasks: SerializedTask[];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(seconds: number | null) {
  if (!seconds) return '--';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function AdminTaskTable({ tasks }: AdminTaskTableProps) {
  const t = useTranslations('Admin');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const filtered = useMemo(() => {
    let result = tasks;

    if (statusFilter !== 'all') {
      result = result.filter((t) => t.status === statusFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.name?.toLowerCase().includes(q) ||
          t.url.toLowerCase().includes(q) ||
          t.uploader?.toLowerCase().includes(q) ||
          t._id.includes(q),
      );
    }

    return [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
        case 'name':
          cmp = (a.name ?? '').localeCompare(b.name ?? '');
          break;
        case 'createdAt':
          cmp =
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'updatedAt':
          cmp =
            new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        case 'duration':
          cmp = (a.duration ?? 0) - (b.duration ?? 0);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [tasks, search, statusFilter, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };

  const thClass = (field: SortField) =>
    `admin-th${sortField === field ? ' admin-th--active' : ''}`;

  return (
    <Box marginTop={28} marginBottom={40}>
      <Box className="admin-toolbar">
        <TextInput
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(value) => setSearch(value)}
          className="admin-search"
        />
        <select
          title="status"
          name="status"
          className="admin-filter-select"
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as TaskStatus | 'all')
          }
        >
          <option value="all">{t('filterAllStatuses')}</option>
          <option value="pending">{t('filterPending')}</option>
          <option value="downloading">{t('filterDownloading')}</option>
          <option value="processing">processing</option>
          <option value="converting">converting</option>
          <option value="burning">burning</option>
          <option value="translating">translating</option>
          <option value="done">{t('filterDone')}</option>
          <option value="error">{t('filterError')}</option>
        </select>
        <Typography variant="body-sm" className="admin-result-count">
          {t('taskCount', { count: filtered.length })}
        </Typography>
      </Box>

      <Box className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th
                className={thClass('status')}
                onClick={() => handleSort('status')}
              >
                Status{sortIndicator('status')}
              </th>
              <th
                className={thClass('name')}
                onClick={() => handleSort('name')}
              >
                Name / URL{sortIndicator('name')}
              </th>
              <th className="admin-th" style={{ cursor: 'default' }}>
                Type
              </th>
              <th
                className={thClass('duration')}
                onClick={() => handleSort('duration')}
              >
                Duration{sortIndicator('duration')}
              </th>
              <th
                className={thClass('createdAt')}
                onClick={() => handleSort('createdAt')}
              >
                Created{sortIndicator('createdAt')}
              </th>
              <th
                className={thClass('updatedAt')}
                onClick={() => handleSort('updatedAt')}
              >
                Updated{sortIndicator('updatedAt')}
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((task) => (
              <tr
                key={task._id}
                className={`admin-tr${task.status === 'error' ? ' admin-tr--error' : ''}`}
              >
                <td className="admin-td">
                  <Badge
                    variant="subtle"
                    size="sm"
                    color={STATUS_COLORS[task.status]}
                  >
                    {task.status}
                  </Badge>
                </td>
                <td className="admin-td admin-td--name">
                  <Typography variant="body-sm" className="admin-task-name">
                    {task.name ?? task.uploader ?? '--'}
                  </Typography>
                  <Typography variant="body-sm" className="admin-task-url">
                    {task.url}
                  </Typography>
                  {task.error && (
                    <Typography variant="caption" className="admin-task-error">
                      {task.error.code}: {task.error.message}
                    </Typography>
                  )}
                </td>
                <td className="admin-td">
                  <Box className="admin-type-badges">
                    <Badge
                      variant="outlined"
                      size="sm"
                      color={task.justAudio ? '#f59e0b' : '#06b6d4'}
                    >
                      {task.justAudio ? 'Audio' : 'Video'}
                    </Badge>
                    {task.isH265 && (
                      <Badge variant="outlined" size="sm" color="#8b5cf6">
                        H265
                      </Badge>
                    )}
                  </Box>
                </td>
                <td className="admin-td admin-td--mono">
                  {formatDuration(task.duration)}
                </td>
                <td className="admin-td admin-td--mono">
                  {formatDate(task.createdAt)}
                </td>
                <td className="admin-td admin-td--mono">
                  {formatDate(task.updatedAt)}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td className="admin-td admin-td--empty" colSpan={6}>
                  {t('noTasksFound')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Box>
    </Box>
  );
}

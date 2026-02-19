'use client';

import { useState, useMemo } from 'react';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Badge } from '@repo/ui/core-elements/badge';
import type { TaskStatus } from '@/lib/types';

const STATUS_COLORS: Record<TaskStatus, string> = {
  pending: '#999',
  downloading: '#06b6d4',
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
    <div style={{ marginTop: 28, marginBottom: 40 }}>
      <div className="admin-toolbar">
        <TextInput
          placeholder="Search by name, URL, or ID..."
          value={search}
          onChange={(value) => setSearch(value)}
          className="admin-search"
        />
        <select
          name="status"
          className="admin-filter-select"
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as TaskStatus | 'all')
          }
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="downloading">Downloading</option>
          <option value="done">Done</option>
          <option value="error">Error</option>
        </select>
        <span className="admin-result-count">
          {filtered.length} task{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="admin-table-wrapper">
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
                  <span className="admin-task-name">
                    {task.name ?? task.uploader ?? '--'}
                  </span>
                  <span className="admin-task-url" title={task.url}>
                    {task.url}
                  </span>
                  {task.error && (
                    <span
                      className="admin-task-error"
                      title={task.error.message}
                    >
                      {task.error.code}: {task.error.message}
                    </span>
                  )}
                </td>
                <td className="admin-td">
                  <div className="admin-type-badges">
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
                  </div>
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
                  No tasks found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

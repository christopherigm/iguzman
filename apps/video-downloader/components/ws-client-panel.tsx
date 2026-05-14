'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Icon } from '@repo/ui/core-elements/icon';
import { Box } from '@repo/ui/core-elements/box';
import { Button } from '@repo/ui/core-elements/button';
import { Typography } from '@repo/ui/core-elements/typography';
import { Spinner } from '@repo/ui/core-elements/spinner';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import './ws-client-panel.css';

/* ── Exports ────────────────────────────────────────── */

export interface StoredWsClient {
  uuid: string;
  label: string;
  connected: boolean;
}

export const THIS_DEVICE_UUID = '__local__';
export const WS_CLIENTS_KEY = 'vd-ws-clients';

/* ── Types ──────────────────────────────────────────── */

export interface WsClientPanelLabels {
  thisDevice: string;
  server?: string;
  addServer?: string;
  deleteServer?: string;
  addServerTitle?: string;
  addServerText?: string;
  wsClientUuidLabel?: string;
  wsClientNameLabel?: string;
  deleteServerTitle?: string;
  /** Receives the client label, returns the formatted confirmation text. */
  deleteServerText?: (label: string) => string;
  /** Hint shown below the inputs in the add-server modal, explaining that the server app must be installed. */
  installHint?: string;
  /** Label for the Linux download button. */
  downloadLinux?: string;
  /** Label for the Windows download button. */
  downloadWindows?: string;
  /** Appended to offline client names in the dropdown. */
  offline?: string;
}

interface WsClientPanelProps {
  onChange: (uuid: string) => void;
  /** Called whenever the online status of the selected client changes. */
  onOnlineChange?: (isOnline: boolean) => void;
  labels: WsClientPanelLabels;
  /** Pre-select a specific UUID on mount (e.g. from a stored video). */
  initialValue?: string | null;
  /** Compact mode: renders a small select row or nothing when no clients are registered. */
  compact?: boolean;
  /** Show add/delete server management UI. */
  showManagement?: boolean;
}

/* ── Component ──────────────────────────────────────── */

export function WsClientPanel({
  onChange,
  onOnlineChange,
  labels,
  initialValue,
  compact = false,
  showManagement = false,
}: WsClientPanelProps) {
  const [clients, setClients] = useState<StoredWsClient[]>([]);
  const [selectedUuid, setSelectedUuid] = useState<string>(
    initialValue ?? THIS_DEVICE_UUID,
  );
  const selectedUuidRef = useRef(initialValue ?? THIS_DEVICE_UUID);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUuid, setNewUuid] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [addingServer, setAddingServer] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingServer, setDeletingServer] = useState(false);

  const refreshStatus = useCallback(() => {
    fetch('/api/ws-clients')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Array<{ uuid: string; connected: boolean }> | null) => {
        if (!data) return;
        const statusMap = new Map(data.map((c) => [c.uuid, c.connected]));
        let updatedClients: StoredWsClient[] = [];
        setClients((prev) => {
          updatedClients = prev.map((c) => ({
            ...c,
            connected: statusMap.get(c.uuid) ?? false,
          }));
          return updatedClients;
        });
        const cur = selectedUuidRef.current;
        if (cur !== THIS_DEVICE_UUID && statusMap.get(cur) !== true) {
          // Use stored order (matches visual list order) to find first connected
          const firstConnected = updatedClients.find((c) => c.connected);
          const next = firstConnected?.uuid ?? THIS_DEVICE_UUID;
          selectedUuidRef.current = next;
          setSelectedUuid(next);
          onChange(next);
        }
      })
      .catch(() => {});
  }, [onChange]);

  /* Load clients from localStorage and hydrate connection status */
  useEffect(() => {
    let stored: StoredWsClient[] = [];
    try {
      stored = JSON.parse(
        localStorage.getItem(WS_CLIENTS_KEY) ?? '[]',
      ) as StoredWsClient[];
      if (!Array.isArray(stored)) stored = [];
    } catch {
      stored = [];
    }

    if (stored.length === 0) {
      setSelectedUuid(THIS_DEVICE_UUID);
      onChange(THIS_DEVICE_UUID);
      return;
    }

    setClients(stored);
    const initial = initialValue ?? stored[0]?.uuid ?? THIS_DEVICE_UUID;
    setSelectedUuid(initial);
    onChange(initial);
    refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = useCallback(
    (uuid: string) => {
      selectedUuidRef.current = uuid;
      setSelectedUuid(uuid);
      onChange(uuid);
    },
    [onChange],
  );

  const handleAddServer = useCallback(async () => {
    const uuid = newUuid.trim();
    const label = newLabel.trim();
    if (!uuid || !label) return;
    setShowAddModal(false);
    setAddingServer(true);
    try {
      const res = await fetch('/api/ws-clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uuid, label }),
      });
      if (res.ok) {
        const newClient: StoredWsClient = { uuid, label, connected: false };
        setClients((prev) => {
          const updated = [...prev, newClient];
          localStorage.setItem(WS_CLIENTS_KEY, JSON.stringify(updated));
          return updated;
        });
        setNewUuid('');
        setNewLabel('');
        handleChange(uuid);
        refreshStatus();
      }
    } catch {
      /* best-effort */
    } finally {
      setAddingServer(false);
    }
  }, [newUuid, newLabel, handleChange, refreshStatus]);

  const handleDeleteServer = useCallback(async () => {
    if (!selectedUuid || selectedUuid === THIS_DEVICE_UUID) return;
    setShowDeleteModal(false);
    setDeletingServer(true);
    try {
      await fetch(`/api/ws-clients?uuid=${encodeURIComponent(selectedUuid)}`, {
        method: 'DELETE',
      });
      let remaining: StoredWsClient[] = [];
      setClients((prev) => {
        remaining = prev.filter((c) => c.uuid !== selectedUuid);
        localStorage.setItem(WS_CLIENTS_KEY, JSON.stringify(remaining));
        return remaining;
      });
      const next = remaining[0]?.uuid ?? THIS_DEVICE_UUID;
      handleChange(next);
    } catch {
      /* best-effort */
    } finally {
      setDeletingServer(false);
    }
  }, [selectedUuid, handleChange]);

  /* ── Derived ───────────────────────────────────────── */

  const isThisDevice = selectedUuid === THIS_DEVICE_UUID;
  const selectedClient = clients.find((c) => c.uuid === selectedUuid);
  const isOnline = isThisDevice || (selectedClient?.connected ?? false);

  useEffect(() => {
    onOnlineChange?.(isOnline);
  }, [isOnline, onOnlineChange]);

  /* ── Select element (shared between both modes) ────── */

  const dotClass = isOnline ? 'wcp-dot--online' : 'wcp-dot--offline';

  const onlineClients = clients.filter((c) => c.connected);
  const offlineClients = clients.filter((c) => !c.connected);

  const renderOptions = () => (
    <>
      {onlineClients.map((c) => (
        <option
          key={c.uuid}
          value={c.uuid}
          style={{ backgroundColor: 'var(--surface-1, #f4f4f5)' }}
        >
          {c.label}
        </option>
      ))}
      <option
        value={THIS_DEVICE_UUID}
        style={{ backgroundColor: 'var(--surface-1, #f4f4f5)' }}
      >
        {labels.thisDevice}
      </option>
      {offlineClients.map((c) => (
        <option
          key={c.uuid}
          value={c.uuid}
          style={{ backgroundColor: 'var(--surface-1, #f4f4f5)' }}
        >
          {c.label} ({labels.offline ?? 'offline'})
        </option>
      ))}
    </>
  );

  const selectEl = compact ? (
    <Box className="wcp-sm-select-wrapper">
      <span className={`wcp-sm-dot ${dotClass}`} />
      <select
        className="wcp-sm-select"
        value={selectedUuid}
        onChange={(e) => handleChange(e.target.value)}
        aria-label={labels.server ?? 'Server'}
      >
        {renderOptions()}
      </select>
      <span className="wcp-sm-select-chevron">
        <Icon
          icon="/icons/chevron-down.svg"
          size={12}
          color="var(--foreground, #171717)"
        />
      </span>
    </Box>
  ) : (
    <Box className="wcp-select-wrapper">
      <span className={`wcp-dot ${dotClass}`} />
      <select
        className="wcp-select"
        value={selectedUuid}
        onChange={(e) => handleChange(e.target.value)}
        disabled={deletingServer}
        aria-label={labels.server ?? 'Server'}
      >
        {renderOptions()}
      </select>
      <span className="wcp-select-chevron">
        <Icon
          icon="/icons/chevron-down.svg"
          size={14}
          color="var(--foreground, #171717)"
        />
      </span>
    </Box>
  );

  /* ── Compact (no management) ────────────────────────── */

  if (!showManagement) {
    if (clients.length === 0) return null;
    return (
      <Box className="wcp-sm-row">
        {labels.server ? (
          <Typography variant="caption" className="wcp-sm-label">
            {labels.server}
          </Typography>
        ) : null}
        {selectEl}
      </Box>
    );
  }

  /* ── Full management UI ─────────────────────────────── */

  const selectedLabel = selectedClient?.label ?? '';

  return (
    <>
      <Box className="wcp-controls">
        <Box display="flex" alignItems="center" gap={8}>
          <Button
            text={labels.addServer ?? 'Add server'}
            disabled={addingServer || deletingServer}
            onClick={() => {
              setNewUuid('');
              setNewLabel('');
              setShowAddModal(true);
            }}
            kind="success"
          />

          {(addingServer || deletingServer) && (
            <Spinner size={18} thickness={2} />
          )}
        </Box>

        <Box display="flex" alignItems="center" gap={8}>
          {clients.length > 0 && selectedUuid !== THIS_DEVICE_UUID ? (
            <button
              type="button"
              className="wcp-delete-btn"
              disabled={deletingServer || addingServer}
              onClick={() => setShowDeleteModal(true)}
              aria-label={labels.deleteServer ?? 'Delete server'}
            >
              <Icon
                icon="/icons/delete-video.svg"
                size={18}
                color="var(--foreground, #171717)"
              />
            </button>
          ) : null}

          {selectEl}
        </Box>
      </Box>

      {showAddModal ? (
        <ConfirmationModal
          title={labels.addServerTitle ?? 'Add server'}
          text={labels.addServerText ?? ''}
          okCallback={handleAddServer}
          cancelCallback={() => setShowAddModal(false)}
        >
          <Box flexDirection="column" gap={12} marginTop={8}>
            <TextInput
              label={labels.wsClientNameLabel ?? 'Label'}
              value={newLabel}
              onChange={setNewLabel}
            />
            <TextInput
              label={labels.wsClientUuidLabel ?? 'UUID'}
              value={newUuid}
              onChange={setNewUuid}
            />
            {labels.installHint ||
            labels.downloadLinux ||
            labels.downloadWindows ? (
              <Box className="wcp-install-section" marginTop={8}>
                {labels.installHint ? (
                  <Typography variant="caption" className="wcp-install-hint">
                    {labels.installHint}
                  </Typography>
                ) : null}
                <Box className="wcp-download-btns">
                  {labels.downloadLinux ? (
                    <a
                      href="/api/media/binaries/server-video-editor_0.1.10_amd64.deb"
                      download
                      className="wcp-dl-btn"
                    >
                      <Icon
                        icon="/icons/linux.svg"
                        size={18}
                        color="var(--foreground, #171717)"
                      />
                      {labels.downloadLinux}
                    </a>
                  ) : null}
                  {labels.downloadWindows ? (
                    <a
                      href="/api/media/binaries/server-video-editor_0.1.13.exe"
                      download
                      className="wcp-dl-btn"
                    >
                      <Icon
                        icon="/icons/windows.svg"
                        size={18}
                        color="var(--foreground, #171717)"
                      />
                      {labels.downloadWindows}
                    </a>
                  ) : null}
                </Box>
              </Box>
            ) : null}
          </Box>
        </ConfirmationModal>
      ) : null}

      {showDeleteModal ? (
        <ConfirmationModal
          title={labels.deleteServerTitle ?? 'Delete server'}
          text={
            labels.deleteServerText
              ? labels.deleteServerText(selectedLabel)
              : `Delete "${selectedLabel}"?`
          }
          okCallback={handleDeleteServer}
          cancelCallback={() => setShowDeleteModal(false)}
        />
      ) : null}
    </>
  );
}

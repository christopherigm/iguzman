'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Button } from '@repo/ui/core-elements/button';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Select } from '@repo/ui/core-elements/select';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import { counties, states, AdminApiError } from '@/lib/admin-api';
import { buildSlug } from '@/lib/slug-utils';
import './geography-panel.css';

/**
 * The states and counties a place is filed under, managed where they are used.
 *
 * These are lookup rows, not content: adding one is a name and nothing else, and
 * it is almost always needed *mid-way through filing a location* - which is a bad
 * moment to be sent to another section and lose the form. So the whole lifecycle
 * lives here, under the locations table, and `/admin/states` and
 * `/admin/counties` exist for the rarer bulk edit.
 *
 * Two things to know:
 *
 * - **A county's state is required** (the API's FK is PROTECT and non-null), so
 *   the county form here has no "no state" option and refuses to submit without
 *   one. A state that still has counties cannot be deleted; the API answers 409
 *   and this says so rather than reporting a generic failure.
 * - **The slug is derived, never typed.** These rows have no page of their own,
 *   so their slug is only a stable key - but it is unique, so two states called
 *   "Jalisco" collide on it. That comes back as a field error, which is exactly
 *   the right message: the row already exists, which is the duplication this
 *   whole feature exists to prevent.
 */

type Row = Record<string, unknown>;
type Pending = { kind: 'state' | 'county'; row: Row } | null;

export function GeographyPanel() {
  const t = useTranslations('Admin');
  const tCommon = useTranslations('Common');

  const [stateRows, setStateRows] = useState<Row[]>([]);
  const [countyRows, setCountyRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stateName, setStateName] = useState('');
  const [countyName, setCountyName] = useState('');
  const [countyState, setCountyState] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Pending>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextStates, nextCounties] = await Promise.all([states.list(), counties.list()]);
      setStateRows(nextStates);
      setCountyRows(nextCounties);
    } catch {
      setError(t('errorLoad'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const stateOptions = useMemo(
    () =>
      stateRows.map((row) => ({
        value: String(row.id),
        label: String(row.name ?? row.id),
      })),
    [stateRows],
  );

  // Counties under the state they belong to, so the panel reads as the tree it
  // is rather than one long alphabetical list. A state with none still shows,
  // which is how an author sees they have added a state and not yet used it.
  const grouped = useMemo(
    () =>
      stateRows.map((state) => ({
        state,
        counties: countyRows.filter((county) => county.state === state.id),
      })),
    [stateRows, countyRows],
  );

  /** The API's field errors, or a generic message. A duplicate slug lands here. */
  const reportError = (err: unknown, fallback: string) => {
    if (err instanceof AdminApiError) {
      const slug = err.data.slug;
      if (Array.isArray(slug) && typeof slug[0] === 'string') {
        setError(t('geographyDuplicate'));
        return;
      }
    }
    setError(fallback);
  };

  const addState = async () => {
    const name = stateName.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    try {
      await states.create({ name, slug: buildSlug(name) });
      setStateName('');
      await load();
    } catch (err) {
      reportError(err, t('errorSave'));
    } finally {
      setSaving(false);
    }
  };

  const addCounty = async () => {
    const name = countyName.trim();
    if (!name || !countyState) return;
    setSaving(true);
    setError(null);
    try {
      await counties.create({ name, slug: buildSlug(name), state: Number(countyState) });
      setCountyName('');
      await load();
    } catch (err) {
      reportError(err, t('errorSave'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const { kind, row } = pendingDelete;
    setPendingDelete(null);
    setError(null);
    try {
      await (kind === 'state' ? states : counties).remove(row.id as number);
      await load();
    } catch (err) {
      // A 409 is the API refusing to delete a state that still has counties.
      // Saying so is the difference between "try again" and "empty it first".
      const status = (err as { status?: number }).status;
      setError(status === 409 ? t('errorDeleteProtected') : t('errorDelete'));
    }
  };

  return (
    <Box className="geo" flexDirection="column" gap={16} marginTop={32}>
      <Box flexDirection="column" gap={4}>
        <Typography as="h2" variant="h5" fontWeight={700} color="var(--foreground)">
          {t('geography')}
        </Typography>
        <Typography variant="caption" color="var(--foreground)">
          {t('geographyHint')}
        </Typography>
      </Box>

      {error && (
        <Typography variant="caption" color="var(--error, #e53935)">
          {error}
        </Typography>
      )}

      {loading ? (
        <Typography variant="body">{t('loading')}</Typography>
      ) : (
        <>
          {/* ── Add a state ── */}
          <Box display="flex" alignItems="flex-end" gap={8} flexWrap="wrap">
            <TextInput
              label={t('newState')}
              value={stateName}
              onChange={setStateName}
              flex={1}
              minWidth={200}
              onKeyDown={(e) => {
                // This panel sits on a page with no <form> around it, but the
                // habit is worth keeping: Enter submits the field it is in.
                if (e.key !== 'Enter') return;
                e.preventDefault();
                void addState();
              }}
            />
            <Button
              text={t('add')}
              size="md"
              disabled={saving || stateName.trim() === ''}
              onClick={() => void addState()}
            />
          </Box>

          {/* ── Add a county ── */}
          <Box display="flex" alignItems="flex-end" gap={8} flexWrap="wrap">
            <TextInput
              label={t('newCounty')}
              value={countyName}
              onChange={setCountyName}
              flex={1}
              minWidth={200}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                void addCounty();
              }}
            />
            <Select
              label={t('state')}
              value={countyState}
              onChange={setCountyState}
              options={stateOptions}
              minWidth={180}
            />
            <Button
              text={t('add')}
              size="md"
              // A county with no state is what the FK refuses, so the button is
              // what says so - before the round-trip, not after it.
              disabled={saving || countyName.trim() === '' || countyState === ''}
              onClick={() => void addCounty()}
            />
          </Box>

          {stateRows.length === 0 ? (
            <Typography variant="caption" color="var(--foreground)">
              {t('geographyEmpty')}
            </Typography>
          ) : (
            <Box className="geo__tree" flexDirection="column" gap={12}>
              {grouped.map(({ state, counties: rows }) => (
                <Box key={String(state.id)} className="geo__group" flexDirection="column" gap={6}>
                  <Box display="flex" alignItems="center" gap={8} flexWrap="wrap">
                    <Typography as="h3" variant="label" fontWeight={800} color="var(--foreground)">
                      {String(state.name ?? state.id)}
                    </Typography>
                    <Typography as="span" variant="label" color="var(--foreground)">
                      {t('countyCount', { count: rows.length })}
                    </Typography>
                    <Button
                      text={t('edit')}
                      size="sm"
                      href={`/admin/states/${String(state.id)}`}
                    />
                    <Button
                      text={t('delete')}
                      size="sm"
                      onClick={() => setPendingDelete({ kind: 'state', row: state })}
                    />
                  </Box>

                  {rows.length > 0 && (
                    <Box className="geo__counties" display="flex" gap={8} flexWrap="wrap">
                      {rows.map((county) => (
                        <Box
                          key={String(county.id)}
                          className="geo__chip"
                          display="flex"
                          alignItems="center"
                          gap={6}
                          paddingX={10}
                          paddingY={4}
                          borderRadius={999}
                          border="1px solid color-mix(in srgb, var(--foreground) 18%, transparent)"
                        >
                          <Typography as="span" variant="label" color="var(--foreground)">
                            {String(county.name ?? county.id)}
                          </Typography>
                          <Button
                            unstyled
                            text="✎"
                            aria-label={t('edit')}
                            title={t('edit')}
                            href={`/admin/counties/${String(county.id)}`}
                            color="var(--foreground)"
                            styles={{ cursor: 'pointer' }}
                          />
                          <Button
                            unstyled
                            text="×"
                            aria-label={t('delete')}
                            title={t('delete')}
                            onClick={() => setPendingDelete({ kind: 'county', row: county })}
                            color="var(--foreground)"
                            styles={{ cursor: 'pointer' }}
                          />
                        </Box>
                      ))}
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </>
      )}

      {pendingDelete && (
        <ConfirmationModal
          title={t('confirmDeleteTitle')}
          text={t('confirmDelete')}
          okCallback={() => void confirmDelete()}
          cancelCallback={() => setPendingDelete(null)}
          okLabel={tCommon('ok')}
          cancelLabel={tCommon('cancel')}
        />
      )}
    </Box>
  );
}

export default GeographyPanel;

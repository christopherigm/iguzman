'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Button } from '@repo/ui/core-elements/button';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Select } from '@repo/ui/core-elements/select';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import { countries, counties, states, AdminApiError } from '@/lib/admin-api';
import { buildSlug } from '@/lib/slug-utils';
import './geography-panel.css';

/**
 * The countries, states and counties a place is filed under, managed where they
 * are used.
 *
 * These are lookup rows, not content: adding one is a name and nothing else, and
 * it is almost always needed *mid-way through filing a location* - which is a bad
 * moment to be sent to another section and lose the form. So the whole lifecycle
 * lives here, under the locations table, and `/admin/countries`,
 * `/admin/states` and `/admin/counties` exist for the rarer bulk edit.
 *
 * Four things to know:
 *
 * - **Each level's parent is required** (both FKs are non-null and PROTECT on the
 *   API), so neither the state form nor the county form here has a "none" option,
 *   and both refuse to submit without one. A country that still has states, or a
 *   state that still has counties, cannot be deleted; the API answers 409 and this
 *   says so rather than reporting a generic failure.
 * - **The slug is derived, never typed.** These rows have no page of their own, so
 *   their slug is only a stable key - but it is unique, so two states called
 *   "Jalisco" collide on it. That comes back as a field error, which is exactly
 *   the right message: the row already exists, which is the duplication this whole
 *   feature exists to prevent.
 * - ⚠ **The state picker labels every option with its country**, because the
 *   seeded data holds 83 states across two countries and the names are not
 *   globally unique - there is a Durango in Mexico and a Durango in Colorado.
 * - ⚠ **The tree lists only states that already have counties**, with a per-country
 *   toggle for the rest. Rendering all 83 at once - most of them deliberately
 *   seeded without counties, see `seed_geography` - buried the handful an author
 *   actually files against under a wall of empty rows.
 */

type Row = Record<string, unknown>;
type Kind = 'country' | 'state' | 'county';
type Pending = { kind: Kind; row: Row } | null;

const RESOURCES = { country: countries, state: states, county: counties };

export function GeographyPanel() {
  const t = useTranslations('Admin');
  const tCommon = useTranslations('Common');

  const [countryRows, setCountryRows] = useState<Row[]>([]);
  const [stateRows, setStateRows] = useState<Row[]>([]);
  const [countyRows, setCountyRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [countryName, setCountryName] = useState('');
  const [stateName, setStateName] = useState('');
  const [stateCountry, setStateCountry] = useState('');
  const [countyName, setCountyName] = useState('');
  const [countyState, setCountyState] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Pending>(null);
  // Which countries have had their empty states revealed. Keyed by id so the
  // toggle survives a reload of the lists.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextCountries, nextStates, nextCounties] = await Promise.all([
        countries.list(),
        states.list(),
        counties.list(),
      ]);
      setCountryRows(nextCountries);
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

  const countryOptions = useMemo(
    () =>
      countryRows.map((row) => ({
        value: String(row.id),
        label: String(row.name ?? row.id),
      })),
    [countryRows],
  );

  // Every option names its country: with two countries' states in one list, a
  // bare "Durango" cannot say which one it is.
  const stateOptions = useMemo(
    () =>
      stateRows.map((row) => ({
        value: String(row.id),
        label: row.country_name
          ? `${String(row.name ?? row.id)} - ${String(row.country_name)}`
          : String(row.name ?? row.id),
      })),
    [stateRows],
  );

  /**
   * The tree, top down: each country, its states that hold counties, and each of
   * those states' counties. States with no counties are counted separately so the
   * common case is not buried under the seeded remainder.
   */
  const tree = useMemo(
    () =>
      countryRows.map((country) => {
        const owned = stateRows.filter((state) => state.country === country.id);
        const withCounties = owned
          .map((state) => ({
            state,
            counties: countyRows.filter((county) => county.state === state.id),
          }))
          .filter((group) => group.counties.length > 0);
        const empty = owned.filter(
          (state) => !countyRows.some((county) => county.state === state.id),
        );
        return { country, withCounties, empty };
      }),
    [countryRows, stateRows, countyRows],
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

  /** Create one lookup row, then reload all three lists. */
  const add = async (kind: Kind, name: string, extra: Row, reset: () => void) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      await RESOURCES[kind].create({ name: trimmed, slug: buildSlug(trimmed), ...extra });
      reset();
      await load();
    } catch (err) {
      reportError(err, t('errorSave'));
    } finally {
      setSaving(false);
    }
  };

  const addCountry = () => add('country', countryName, {}, () => setCountryName(''));
  const addState = () =>
    add('state', stateName, { country: Number(stateCountry) }, () => setStateName(''));
  const addCounty = () =>
    add('county', countyName, { state: Number(countyState) }, () => setCountyName(''));

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const { kind, row } = pendingDelete;
    setPendingDelete(null);
    setError(null);
    try {
      await RESOURCES[kind].remove(row.id as number);
      await load();
    } catch (err) {
      // A 409 is the API refusing to delete a row that still has children - a
      // country with states, or a state with counties. Saying so is the difference
      // between "try again" and "empty it first".
      const status = (err as { status?: number }).status;
      setError(status === 409 ? t('errorDeleteProtected') : t('errorDelete'));
    }
  };

  /** Enter submits the field it is in. This panel has no <form> around it. */
  const onEnter = (submit: () => void) => (event: { key: string; preventDefault: () => void }) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    submit();
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
          {/* ── Add a country ── */}
          <Box display="flex" alignItems="flex-end" gap={8} flexWrap="wrap">
            <TextInput
              label={t('newCountry')}
              value={countryName}
              onChange={setCountryName}
              flex={1}
              minWidth={200}
              onKeyDown={onEnter(addCountry)}
            />
            <Button
              text={t('add')}
              size="md"
              disabled={saving || countryName.trim() === ''}
              onClick={() => void addCountry()}
            />
          </Box>

          {/* ── Add a state ── */}
          <Box display="flex" alignItems="flex-end" gap={8} flexWrap="wrap">
            <TextInput
              label={t('newState')}
              value={stateName}
              onChange={setStateName}
              flex={1}
              minWidth={200}
              onKeyDown={onEnter(addState)}
            />
            <Select
              label={t('country')}
              value={stateCountry}
              onChange={setStateCountry}
              options={countryOptions}
              minWidth={180}
            />
            <Button
              text={t('add')}
              size="md"
              // A state with no country is what the FK refuses, so the button is
              // what says so - before the round-trip, not after it.
              disabled={saving || stateName.trim() === '' || stateCountry === ''}
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
              onKeyDown={onEnter(addCounty)}
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
              disabled={saving || countyName.trim() === '' || countyState === ''}
              onClick={() => void addCounty()}
            />
          </Box>

          {countryRows.length === 0 ? (
            <Typography variant="caption" color="var(--foreground)">
              {t('geographyEmpty')}
            </Typography>
          ) : (
            <Box className="geo__tree" flexDirection="column" gap={12}>
              {tree.map(({ country, withCounties, empty }) => (
                <Box
                  key={String(country.id)}
                  className="geo__group"
                  flexDirection="column"
                  gap={8}
                >
                  <Box display="flex" alignItems="center" gap={8} flexWrap="wrap">
                    <Typography as="h3" variant="label" fontWeight={800} color="var(--foreground)">
                      {String(country.name ?? country.id)}
                    </Typography>
                    <Typography as="span" variant="label" color="var(--foreground)">
                      {t('stateCount', { count: withCounties.length + empty.length })}
                    </Typography>
                    <Button
                      text={t('edit')}
                      size="sm"
                      href={`/admin/countries/${String(country.id)}`}
                    />
                    <Button
                      text={t('delete')}
                      size="sm"
                      onClick={() => setPendingDelete({ kind: 'country', row: country })}
                    />
                  </Box>

                  {[
                    ...withCounties,
                    ...(expanded[String(country.id)]
                      ? empty.map((state) => ({ state, counties: [] as Row[] }))
                      : []),
                  ].map(({ state, counties: rows }) => (
                    <Box
                      key={String(state.id)}
                      flexDirection="column"
                      gap={6}
                      paddingLeft={16}
                    >
                      <Box display="flex" alignItems="center" gap={8} flexWrap="wrap">
                        <Typography as="h4" variant="label" fontWeight={700} color="var(--foreground)">
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

                  {/* The states nobody has filed a county against yet. Hidden by
                      default because `seed_geography` deliberately seeds all 83 and
                      gives counties to only six of them. */}
                  {empty.length > 0 && (
                    <Box paddingLeft={16}>
                      <Button
                        unstyled
                        text={
                          expanded[String(country.id)]
                            ? t('geographyHideEmptyStates', { count: empty.length })
                            : t('geographyShowEmptyStates', { count: empty.length })
                        }
                        onClick={() =>
                          setExpanded((prev) => ({
                            ...prev,
                            [String(country.id)]: !prev[String(country.id)],
                          }))
                        }
                        color="var(--foreground)"
                        styles={{ cursor: 'pointer', textDecoration: 'underline' }}
                      />
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

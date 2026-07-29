'use client';

import { use, useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@repo/i18n/navigation';
import { AdminForm, type FieldDef } from '@/components/admin/admin-form';
import { PairedImageFields, useEntityImages } from '@/components/admin/entity-images';
import { EntityGalleryField, useEntityGallery } from '@/components/admin/entity-gallery';
import { MapPicker } from '@/components/admin/map-picker';
import { counties, locationImages, locations } from '@/lib/admin-api';
import { useDerivedSlug } from '@/hooks/use-derived-slug';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Breadcrumbs } from '@repo/ui/core-elements/breadcrumbs';

type Props = { params: Promise<{ locale: string; id: string }> };
type Coordinates = { latitude: number; longitude: number };

/** Must match `catalog.models.PLACE_TYPE_CHOICES`; labels come from next-intl. */
const PLACE_TYPES = [
  'park',
  'reserve',
  'forest',
  'trail',
  'garden',
  'lake',
  'river',
  'beach',
  'wetland',
  'mountain',
  'desert',
  'urban',
  'backyard',
  'other',
] as const;

export default function AdminLocationFormPage({ params }: Props) {
  const { id } = use(params);
  const isNew = id === 'new';
  const t = useTranslations('Admin');
  const tPlace = useTranslations('PlaceTypes');
  const router = useRouter();

  const [values, setValues] = useState<Record<string, unknown>>({
    name: '',
    en_name: '',
    slug: '',
    parent: '',
    place_type: 'other',
    latitude: '',
    longitude: '',
    county: '',
    hide_precise_location: false,
    short_description: '',
    en_short_description: '',
    description: '',
    en_description: '',
    is_featured: false,
    enabled: true,
  });

  // A place has no `image` column at all, so unlike the other four records its
  // first gallery photo is not merely the default cover - it is the only one.
  // `icon` is the map-pin glyph and stays a field of its own.
  const images = useEntityImages(['icon']);
  const gallery = useEntityGallery(locationImages, isNew ? null : Number(id));
  const [parentOptions, setParentOptions] = useState<
    { value: string | number; label: string }[]
  >([]);
  const [countyOptions, setCountyOptions] = useState<
    { value: string | number; label: string }[]
  >([]);
  // Each candidate parent's own coordinates, keyed by id. A trail inside a park
  // sits within its parent, so that is where the map should open before a pin
  // has been dropped - the same borrowing a sighting does from its location.
  const [parentCoords, setParentCoords] = useState<Record<string, Coordinates>>({});
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useDerivedSlug(isNew, values, setValues);

  useEffect(() => {
    locations
      .list()
      .then((rows) => {
        // A location cannot be its own parent (the API refuses it too), so the
        // row being edited is dropped from its own picker.
        const available = rows.filter((row) => isNew || row.id !== Number(id));
        setParentOptions(
          available.map((row) => ({
            value: row.id as number,
            label: String(row.name ?? row.id),
          })),
        );
        setParentCoords(toCoordinates(available));
      })
      .catch(() => {
        /* non-critical: the form still saves, just without a parent picker */
      });
  }, [id, isNew]);

  useEffect(() => {
    counties
      .list()
      .then((rows) =>
        setCountyOptions(
          // A place stores only its county; the state is read back through it.
          // So each option carries its state in the label - it is what tells a
          // León in Guanajuato from a León in Nicaragua, and it is the only
          // place the state is visible while filing a location.
          rows.map((row) => ({
            value: row.id as number,
            label: row.state_name
              ? `${String(row.name ?? row.id)} — ${String(row.state_name)}`
              : String(row.name ?? row.id),
          })),
        ),
      )
      .catch(() => {
        /* non-critical: the form still saves, just without a county picker */
      });
  }, []);

  useEffect(() => {
    if (isNew) return;
    locations
      .get(Number(id))
      .then((data) => {
        setValues({
          name: data.name ?? '',
          en_name: data.en_name ?? '',
          slug: data.slug ?? '',
          parent: data.parent ?? '',
          place_type: data.place_type ?? 'other',
          latitude: data.latitude ?? '',
          longitude: data.longitude ?? '',
          county: data.county ?? '',
          hide_precise_location: data.hide_precise_location ?? false,
          short_description: data.short_description ?? '',
          en_short_description: data.en_short_description ?? '',
          description: data.description ?? '',
          en_description: data.en_description ?? '',
          is_featured: data.is_featured ?? false,
          enabled: data.enabled ?? true,
        });
        images.hydrate(data);
      })
      .catch(() => setError(t('errorLoad')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew, t]);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Record<string, unknown> = { ...values, ...images.payload() };
      // Updates are PATCH, so an omitted key means "leave unchanged" - clearing
      // a value needs an explicit null.
      if (payload.parent === '') payload.parent = null;
      if (payload.county === '') payload.county = null;
      // A coordinate is a decimal or nothing; "" is neither, and the API would
      // reject the whole save over an untouched empty field.
      (['latitude', 'longitude'] as const).forEach((k) => {
        if (payload[k] === '') payload[k] = null;
      });
      // The gallery is written after the row exists: a photo is POSTed to this
      // place's own URL, which one being created does not have until now.
      if (isNew) {
        const created = await locations.create(payload);
        await gallery.persist(created.id as number);
        setSuccess(t('saved'));
        router.replace(`/admin/locations/${created.id}`);
      } else {
        await locations.update(Number(id), payload);
        await gallery.persist(Number(id));
        setSuccess(t('saved'));
      }
    } catch {
      setError(t('errorSave'));
    } finally {
      setSaving(false);
    }
  };

  const fields: FieldDef[] = [
    { key: 'name', label: t('name'), required: true },
    { key: 'en_name', label: t('name') },
    { key: 'slug', label: t('slug'), type: 'slug', disabled: true },
    {
      key: 'parent',
      label: t('parent'),
      type: 'select',
      options: parentOptions,
      placeholder: t('none'),
    },
    {
      key: 'place_type',
      label: t('placeType'),
      type: 'select',
      options: PLACE_TYPES.map((value) => ({ value, label: tPlace(value) })),
    },
    // The place's own coordinates - what every map on the site is drawn from,
    // and what a sighting filed here falls back to when it carries none. The map
    // above the pair writes both at once; typing into either still moves the pin.
    { key: 'latitude', label: t('latitude'), type: 'number' },
    { key: 'longitude', label: t('longitude'), type: 'number' },
    // The only geography a place stores. Its state is read back through the
    // county - which is why there is no state field beside this one, and why
    // each option names its state.
    {
      key: 'county',
      label: t('county'),
      type: 'select',
      options: countyOptions,
      placeholder: t('none'),
    },
    // ⚠ This blurs the published coordinates for *everyone*, staff included -
    // the payload is cached under one key per resource, so there is no
    // per-viewer variant. Whoever needs the exact spot reads it here.
    {
      key: 'hide_precise_location',
      label: t('hidePreciseLocation'),
      type: 'boolean',
    },
    { key: 'short_description', label: t('shortDescription'), type: 'textarea' },
    { key: 'en_short_description', label: t('shortDescription'), type: 'textarea' },
    { key: 'description', label: t('description'), type: 'textarea' },
    { key: 'en_description', label: t('description'), type: 'textarea' },
    { key: 'is_featured', label: t('featured'), type: 'boolean' },
    { key: 'enabled', label: t('enabled'), type: 'boolean' },
  ];

  if (loading)
    return (
      <Box padding="24px">
        <Typography variant="body">{t('loading')}</Typography>
      </Box>
    );

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t('home'), href: '/' },
          { label: t('breadcrumbAdmin'), href: '/admin' },
          { label: t('locations'), href: '/admin/locations' },
          { label: isNew ? t('newItem') : t('edit') },
        ]}
      />
      <AdminForm
        title={isNew ? `${t('newItem')} - ${t('locations')}` : `${t('edit')} - ${t('locations')}`}
        editingName={isNew ? undefined : String(values.name ?? '')}
        isEditing={!isNew}
        fields={fields}
        values={values}
        onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        onSubmit={handleSubmit}
        saving={saving}
        error={error}
        success={success}
        imagesSlot={
          <EntityGalleryField
            gallery={gallery}
            iconSlot={<PairedImageFields images={images} />}
          />
        }
        slots={[
          {
            beforeKey: 'latitude',
            node: (
              <MapPicker
                latitude={String(values.latitude ?? '')}
                longitude={String(values.longitude ?? '')}
                onChange={(latitude, longitude) =>
                  setValues((prev) => ({ ...prev, latitude, longitude }))
                }
                // With no pin of its own, the map opens over the parent place -
                // a trail is inside its park. A top-level place has no parent to
                // borrow from, so there the map opens on its default view.
                fallbackCenter={parentCoords[String(values.parent ?? '')] ?? null}
              />
            ),
          },
        ]}
      />
    </>
  );
}

/**
 * The coordinates of every place that has a pair, keyed by id - where the map
 * opens for a child place that has no pin of its own yet.
 *
 * A parent is only rough guidance: the API rounds a sensitive place's published
 * coordinates to about a kilometre for every caller, so what arrives here may
 * already be blurred. A place with no coordinates is simply absent, and the map
 * falls back to its default view.
 */
function toCoordinates(rows: Record<string, unknown>[]): Record<string, Coordinates> {
  const out: Record<string, Coordinates> = {};
  rows.forEach((row) => {
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    if (row.latitude == null || row.longitude == null) return;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    out[String(row.id)] = { latitude, longitude };
  });
  return out;
}

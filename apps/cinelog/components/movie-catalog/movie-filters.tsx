'use client';

import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Select, type SelectOption } from '@repo/ui/core-elements/select';
import type { Category, MovieFormat } from '@/lib/catalog';

const FORMATS: Exclude<MovieFormat, ''>[] = ['dvd', 'bluray', '4k', 'other'];

type Props = {
  search: string;
  onSearchChange: (value: string) => void;
  genre: string;
  onGenreChange: (value: string) => void;
  format: MovieFormat;
  onFormatChange: (value: MovieFormat) => void;
  categories: Category[];
};

export function MovieFilters({
  search,
  onSearchChange,
  genre,
  onGenreChange,
  format,
  onFormatChange,
  categories,
}: Props) {
  const t = useTranslations('CatalogPage');
  const tFormat = useTranslations('MovieFormat');

  const genreOptions: SelectOption[] = [
    { value: '', label: t('allGenres') },
    ...categories.map((category) => ({ value: category.slug, label: category.name })),
  ];

  const formatOptions: SelectOption[] = [
    { value: '', label: t('allFormats') },
    ...FORMATS.map((value) => ({ value, label: tFormat(value) })),
  ];

  return (
    <Box display="flex" gap={8} flexWrap="wrap">
      <TextInput
        type="search"
        label={t('searchLabel')}
        value={search}
        onChange={onSearchChange}
        flex="2 1 200px"
      />
      <Select
        label={t('genreLabel')}
        value={genre}
        onChange={onGenreChange}
        options={genreOptions}
        flex="1 1 140px"
      />
      <Select
        label={t('formatLabel')}
        value={format}
        onChange={(value) => onFormatChange(value as MovieFormat)}
        options={formatOptions}
        flex="1 1 140px"
      />
    </Box>
  );
}

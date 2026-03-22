'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Box } from '@repo/ui/core-elements/box';
import { Button } from '@repo/ui/core-elements/button';
import { Typography } from '@repo/ui/core-elements/typography';
import type { BuyableVariantOptionValue } from '@/lib/catalog';
import './variant-selector-client.css';

interface VariantForSelector {
  id: number;
  is_default: boolean;
  option_values: BuyableVariantOptionValue[];
}

interface VariantSelectorClientProps {
  variants: VariantForSelector[];
  selectedVariantId: number | null;
  locale: string;
}

export function VariantSelectorClient({
  variants,
  selectedVariantId,
  locale,
}: VariantSelectorClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const variantsWithOptions = variants.filter((v) => v.option_values.length > 0);
  if (variantsWithOptions.length === 0) return null;

  // Build a map of option_name → unique option values (ordered)
  const optionsMap = new Map<string, BuyableVariantOptionValue[]>();
  for (const variant of variantsWithOptions) {
    for (const ov of variant.option_values) {
      if (!optionsMap.has(ov.option_name)) {
        optionsMap.set(ov.option_name, []);
      }
      const existing = optionsMap.get(ov.option_name)!;
      if (!existing.find((e) => e.id === ov.id)) {
        existing.push(ov);
      }
    }
  }

  const selectedVariant =
    variantsWithOptions.find((v) => v.id === selectedVariantId) ??
    variantsWithOptions.find((v) => v.is_default) ??
    variantsWithOptions[0];

  const selectedValueIds = new Set(
    selectedVariant?.option_values.map((ov) => ov.id) ?? [],
  );

  function handleSelect(optionName: string, valueId: number) {
    // Build a map of selected values per option, replacing the changed one
    const currentSelections = new Map<string, number>();
    for (const ov of selectedVariant?.option_values ?? []) {
      currentSelections.set(ov.option_name, ov.id);
    }
    currentSelections.set(optionName, valueId);

    // Find the variant matching all selected values
    const match = variantsWithOptions.find((v) => {
      for (const [, vId] of currentSelections) {
        if (!v.option_values.find((ov) => ov.id === vId)) return false;
      }
      return true;
    });

    if (match) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('variant', String(match.id));
      router.push(`${pathname}?${params.toString()}`);
    }
  }

  return (
    <Box className="variant-selector">
      {Array.from(optionsMap.entries()).map(([optionName, values]) => {
        const sortedValues = [...values].sort(
          (a, b) => a.sort_order - b.sort_order,
        );
        return (
          <Box key={optionName} className="variant-selector__group">
            <Typography as="span" variant="none" className="variant-selector__label">
              {optionName}
            </Typography>
            <Box className="variant-selector__values">
              {sortedValues.map((ov) => {
                const isSelected = selectedValueIds.has(ov.id);
                const displayName =
                  (locale === 'en' ? ov.en_name : ov.name) ??
                  ov.name ??
                  ov.en_name ??
                  ov.slug;

                if (ov.color) {
                  return (
                    <Button
                      key={ov.id}
                      unstyled
                      title={displayName}
                      className={`variant-selector__swatch${isSelected ? ' variant-selector__swatch--selected' : ''}`}
                      styles={{ backgroundColor: ov.color }}
                      onClick={() => handleSelect(optionName, ov.id)}
                      aria-pressed={isSelected}
                      aria-label={`${optionName}: ${displayName}`}
                    />
                  );
                }

                return (
                  <Button
                    key={ov.id}
                    unstyled
                    text={displayName}
                    className={`variant-selector__chip${isSelected ? ' variant-selector__chip--selected' : ''}`}
                    onClick={() => handleSelect(optionName, ov.id)}
                    aria-pressed={isSelected}
                  />
                );
              })}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

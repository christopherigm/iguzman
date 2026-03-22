import { getTranslations } from 'next-intl/server';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import type { ServiceDetail, ServiceVariantFull } from '@/lib/catalog';
import { VariantSelectorClient } from './variant-selector-client';
import { FavoriteButtonClient } from './favorite-button-client';
import { ActionButtonsClient } from './action-buttons-client';
import './service-detail.css';

function formatPrice(amount: string, currency: string): string {
  const num = parseFloat(amount);
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${currency} ${num.toFixed(2)}`;
  }
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function discountPercent(price: string, comparePrice: string): number {
  const p = parseFloat(price);
  const cp = parseFloat(comparePrice);
  if (cp <= p) return 0;
  return Math.round(((cp - p) / cp) * 100);
}

interface ServiceDetailProps {
  service: ServiceDetail;
  selectedVariant: ServiceVariantFull | null;
  locale: string;
}

export async function ServiceDetailPanel({
  service,
  selectedVariant,
  locale,
}: ServiceDetailProps) {
  const t = await getTranslations('ItemDetail');

  const name =
    (locale === 'en' ? service.en_name : service.name) ??
    service.name ??
    service.en_name ??
    '';

  const description =
    (locale === 'en' ? service.en_description : service.description) ??
    service.description ??
    service.en_description ??
    '';

  const effectivePrice = selectedVariant?.effective_price ?? service.price;
  const effectiveCompare =
    selectedVariant?.effective_compare_price ?? service.compare_price;

  const discount = effectiveCompare
    ? discountPercent(effectivePrice, effectiveCompare)
    : 0;

  const effectiveDuration =
    selectedVariant?.effective_duration ?? service.duration;
  const effectiveModality =
    selectedVariant?.effective_modality ?? service.modality;

  const modalityLabels: Record<string, string> = {
    online: t('modalityOnline'),
    in_person: t('modalityInPerson'),
    hybrid: t('modalityHybrid'),
  };

  return (
    <Box className="service-detail">
      {/* Name */}
      {name && (
        <Typography as="h1" variant="h3" className="service-detail__name">
          {name}
        </Typography>
      )}

      {/* Meta: brand / category */}
      {(service.brand_name || service.category_name) && (
        <Box className="service-detail__meta">
          {service.brand_name && (
            <Typography
              as="span"
              variant="none"
              className="service-detail__meta-item"
            >
              {t('brand')}: <strong>{service.brand_name}</strong>
            </Typography>
          )}
          {service.category_name && (
            <Typography
              as="span"
              variant="none"
              className="service-detail__meta-item"
            >
              {t('category')}: <strong>{service.category_name}</strong>
            </Typography>
          )}
        </Box>
      )}

      {/* Service badges: duration + modality */}
      {(effectiveDuration || effectiveModality) && (
        <Box className="service-detail__badges">
          {effectiveDuration && (
            <Typography
              as="span"
              variant="none"
              className="service-detail__badge"
            >
              ⏱ {formatDuration(effectiveDuration)}
            </Typography>
          )}
          {effectiveModality && (
            <Typography
              as="span"
              variant="none"
              className="service-detail__badge"
            >
              {modalityLabels[effectiveModality] ?? effectiveModality}
            </Typography>
          )}
        </Box>
      )}

      {/* Pricing */}
      <Box className="service-detail__pricing">
        <Typography as="span" variant="none" className="item-price">
          {formatPrice(effectivePrice, service.currency)}
        </Typography>
        {effectiveCompare &&
          parseFloat(effectiveCompare) > parseFloat(effectivePrice) && (
            <Typography as="span" variant="none" className="item-compare-price">
              {formatPrice(effectiveCompare, service.currency)}
            </Typography>
          )}
        {discount > 0 && (
          <Typography as="span" variant="none" className="item-discount-badge">
            -{discount}%
          </Typography>
        )}
      </Box>

      {/* SKU */}
      {(selectedVariant?.sku ?? service.sku) && (
        <Typography as="span" variant="none" className="service-detail__sku">
          {t('sku')}: {selectedVariant?.sku ?? service.sku}
        </Typography>
      )}

      {/* Variant selector */}
      {service.variants.length > 0 && (
        <VariantSelectorClient
          variants={service.variants}
          selectedVariantId={selectedVariant?.id ?? null}
          locale={locale}
        />
      )}

      {/* Actions */}
      <Box className="service-detail__actions">
        <ActionButtonsClient
          addToCartLabel={t('addToCart')}
          buyNowLabel={t('buyNow')}
        />
        <FavoriteButtonClient label={t('addToFavorites')} />
      </Box>

      {/* Description */}
      {description && (
        <Box className="service-detail__section">
          <Typography as="h2" variant="none" className="item-section-heading">
            {t('description')}
          </Typography>
          <Typography variant="none" className="service-detail__description">
            {description}
          </Typography>
        </Box>
      )}

      {/* Service details */}
      <Box className="service-detail__section">
        <Typography as="h2" variant="none" className="item-section-heading">
          {t('serviceDetails')}
        </Typography>
        <table className="item-specs-table">
          <tbody>
            {service.brand_name && (
              <tr>
                <td>{t('brand')}</td>
                <td>{service.brand_name}</td>
              </tr>
            )}
            {service.category_name && (
              <tr>
                <td>{t('category')}</td>
                <td>{service.category_name}</td>
              </tr>
            )}
            {effectiveModality && (
              <tr>
                <td>{t('modality')}</td>
                <td>
                  {modalityLabels[effectiveModality] ?? effectiveModality}
                </td>
              </tr>
            )}
            {effectiveDuration && (
              <tr>
                <td>{t('duration')}</td>
                <td>{formatDuration(effectiveDuration)}</td>
              </tr>
            )}
            {(selectedVariant?.sku ?? service.sku) && (
              <tr>
                <td>{t('sku')}</td>
                <td>{selectedVariant?.sku ?? service.sku}</td>
              </tr>
            )}
            {service.currency && (
              <tr>
                <td>{t('currency')}</td>
                <td>{service.currency}</td>
              </tr>
            )}
          </tbody>
        </table>
      </Box>
    </Box>
  );
}

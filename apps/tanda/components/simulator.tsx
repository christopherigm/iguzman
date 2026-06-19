'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Card } from '@repo/ui/core-elements/card';
import { Button } from '@repo/ui/core-elements/button';
import { Slider, type SliderStep } from '@repo/ui/core-elements/slider';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import './simulator.css';

// ─── Tier Configuration ────────────────────────────────────────────────────────

type TierKey = 'real_estate' | 'vehicle' | 'travel';

interface TierConfig {
  icon: string;
  monthSteps: number[];
  deltaSteps: number[];
  defaultMonths: number;
  defaultDelta: number;
  downpaymentPct: number;
  defaultPrice: number;
  mitigationKind: 'success' | 'warning' | 'info';
  escrowThreshold?: number;
  requiresInsurance?: boolean;
}

/** Maps TierKey → next-intl nested key for tier translations. */
const TIER_I18N_KEY: Record<TierKey, 'realEstate' | 'vehicle' | 'travel'> = {
  real_estate: 'realEstate',
  vehicle: 'vehicle',
  travel: 'travel',
};

// ─── Vehicle Condition Config ─────────────────────────────────────────────────

const VEHICLE_NEW_DELTA_STEPS = [0.03, 0.035, 0.04, 0.045, 0.05, 0.06];
const VEHICLE_USED_DELTA_STEPS = [-0.1, -0.08, -0.07, -0.06, -0.05];
const VEHICLE_NEW_DEFAULT_DELTA = 0.04;
const VEHICLE_USED_DEFAULT_DELTA = -0.07;

const TIERS: Record<TierKey, TierConfig> = {
  real_estate: {
    icon: '🏠',
    monthSteps: [60, 72, 84, 96, 108, 120],
    deltaSteps: [0.04, 0.045, 0.05, 0.055, 0.06],
    defaultMonths: 84,
    defaultDelta: 0.05,
    downpaymentPct: 0.15,
    defaultPrice: 150000,
    mitigationKind: 'success',
  },
  vehicle: {
    icon: '🚗',
    monthSteps: [12, 18, 24, 30, 36],
    deltaSteps: VEHICLE_NEW_DELTA_STEPS,
    defaultMonths: 24,
    defaultDelta: VEHICLE_NEW_DEFAULT_DELTA,
    downpaymentPct: 0.2,
    defaultPrice: 25000,
    mitigationKind: 'warning',
    requiresInsurance: true,
  },
  travel: {
    icon: '✈️',
    monthSteps: [6, 7, 8, 9, 10, 11, 12],
    deltaSteps: [0.02, 0.025, 0.03, 0.035, 0.04],
    defaultMonths: 9,
    defaultDelta: 0.03,
    downpaymentPct: 0.1,
    defaultPrice: 5000,
    mitigationKind: 'info',
    escrowThreshold: 0.6,
  },
};

// ─── Math Engine ───────────────────────────────────────────────────────────────

/**
 * B. Fixed Monthly Payment (Delta Adjusted)
 * P = [G × (1 + δ × T/2) - G × d] / M
 */
function calcMonthlyPayment(G: number, M: number, delta: number, d: number) {
  const T = M / 12;
  return (G * (1 + delta * (T / 2)) - G * d) / M;
}

/**
 * A. Dynamic Price Adjustment (Delta Curve)
 * G_m = G × (1 + δ)^(m/12)
 */
function calcAssetPriceAtMonth(G: number, delta: number, m: number) {
  return G * Math.pow(1 + delta, m / 12);
}

/**
 * C. Escrow Release Threshold (Tier 3)
 * Finds the first month m where: ΣP_k + (G × d) ≥ G_m × c
 */
function findEscrowUnlockMonth(
  G: number,
  M: number,
  delta: number,
  d: number,
  threshold: number,
): number {
  const P = calcMonthlyPayment(G, M, delta, d);
  const downpayment = G * d;
  for (let m = 1; m <= M; m++) {
    const G_m = calcAssetPriceAtMonth(G, delta, m);
    if (P * m + downpayment >= G_m * threshold) return m;
  }
  return M;
}

interface SimResult {
  P: number;
  N: number;
  downpayment: number;
  G_final: number;
  totalPaid: number;
}

function simulate(
  G: number,
  M: number,
  delta: number,
  d: number,
): SimResult | null {
  if (G <= 0 || M <= 0) return null;
  const P = calcMonthlyPayment(G, M, delta, d);
  const N = M; // Classic ROSCA: one participant per month slot
  const downpayment = G * d;
  const G_final = calcAssetPriceAtMonth(G, delta, M);
  const totalPaid = P * M + downpayment;
  return { P, N, downpayment, G_final, totalPaid };
}

// ─── Formatters ────────────────────────────────────────────────────────────────

const fmtUSD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const fmtUSDCents = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// ─── Sub-components ────────────────────────────────────────────────────────────

function ExplainBtn({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      aria-label="Learn more"
      className="simulator__explain-btn"
    >
      ?
    </Button>
  );
}

function ResultRow({
  label,
  value,
  highlight,
  shaded,
  onExplain,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  shaded?: boolean;
  onExplain?: () => void;
}) {
  return (
    <Box
      display="flex"
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
      padding="12px 20px"
      backgroundColor={shaded ? 'var(--surface-2)' : 'var(--surface-1)'}
    >
      <Box display="flex" alignItems="center" gap={6}>
        <Typography color="var(--muted-foreground, #6b7280)">
          {label}
        </Typography>
        {onExplain && <ExplainBtn onClick={onExplain} />}
      </Box>
      <Typography
        fontWeight={highlight ? 700 : 500}
        color={highlight ? 'var(--accent, #06b6d4)' : 'var(--foreground)'}
        styles={{ fontSize: highlight ? 20 : undefined }}
      >
        {value}
      </Typography>
    </Box>
  );
}

const MITIGATION_BG: Record<TierConfig['mitigationKind'], string> = {
  success: 'color-mix(in srgb, var(--success, #16a34a) 12%, transparent)',
  warning: 'color-mix(in srgb, var(--warning, #d97706) 12%, transparent)',
  info: 'color-mix(in srgb, var(--accent, #06b6d4) 12%, transparent)',
};

const MITIGATION_ICON: Record<TierConfig['mitigationKind'], string> = {
  success: '🔒',
  warning: '⚠️',
  info: '🔐',
};

// ─── Main Component ────────────────────────────────────────────────────────────

export function Simulator() {
  const t = useTranslations('SimulatorPage');
  const [tier, setTier] = useState<TierKey>('real_estate');
  const cfg = TIERS[tier];

  const [priceStr, setPriceStr] = useState<string>(String(cfg.defaultPrice));
  const [months, setMonths] = useState<number>(cfg.defaultMonths);
  const [delta, setDelta] = useState<number>(cfg.defaultDelta);
  const [vehicleCondition, setVehicleCondition] = useState<'new' | 'used'>(
    'new',
  );
  const [explainModal, setExplainModal] = useState<{
    title: string;
    text: string;
  } | null>(null);

  const openExplain = (titleKey: string, textKey: string) =>
    setExplainModal({
      title: t(titleKey as Parameters<typeof t>[0]),
      text: t(textKey as Parameters<typeof t>[0]),
    });

  const G = useMemo(
    () => parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 0,
    [priceStr],
  );

  const result = useMemo(
    () => simulate(G, months, delta, cfg.downpaymentPct),
    [G, months, delta, cfg.downpaymentPct],
  );

  const escrowUnlockMonth = useMemo(() => {
    if (!cfg.escrowThreshold || G <= 0) return null;
    return findEscrowUnlockMonth(
      G,
      months,
      delta,
      cfg.downpaymentPct,
      cfg.escrowThreshold,
    );
  }, [G, months, delta, cfg]);

  const monthSliderSteps: SliderStep[] = cfg.monthSteps.map((m) => ({
    value: m,
    label: m >= 12 && m % 12 === 0 ? `${m / 12}y` : `${m}m`,
  }));

  const effectiveDeltaSteps =
    tier === 'vehicle'
      ? vehicleCondition === 'new'
        ? VEHICLE_NEW_DELTA_STEPS
        : VEHICLE_USED_DELTA_STEPS
      : cfg.deltaSteps;

  const deltaSliderSteps: SliderStep[] = effectiveDeltaSteps.map((d) => ({
    value: d,
    label: `${(d * 100).toFixed(1)}%`,
  }));

  const handleVehicleConditionSwitch = (condition: 'new' | 'used') => {
    setVehicleCondition(condition);
    setDelta(
      condition === 'new'
        ? VEHICLE_NEW_DEFAULT_DELTA
        : VEHICLE_USED_DEFAULT_DELTA,
    );
  };

  const handleTierSwitch = (next: TierKey) => {
    const nextCfg = TIERS[next];
    setTier(next);
    setMonths(nextCfg.defaultMonths);
    if (next === 'vehicle') {
      setVehicleCondition('new');
      setDelta(VEHICLE_NEW_DEFAULT_DELTA);
    } else {
      setDelta(nextCfg.defaultDelta);
    }
    setPriceStr(String(nextCfg.defaultPrice));
  };

  const T = months / 12;
  const escrowPct = escrowUnlockMonth
    ? Math.round((escrowUnlockMonth / months) * 100)
    : null;

  return (
    <Box display="flex" flexDirection="column" gap={24} width="100%">
      {/* Header */}
      <Box display="flex" flexDirection="column" gap={4}>
        <Typography as="h1" fontWeight={700} color="var(--foreground)">
          {t('heading')}
        </Typography>
        <Typography color="var(--muted-foreground, #6b7280)">
          {t('subtitle')}
        </Typography>
      </Box>

      {explainModal && (
        <ConfirmationModal
          title={explainModal.title}
          text={explainModal.text}
          okCallback={() => setExplainModal(null)}
        />
      )}

      {/* Tier Tabs */}
      <Box display="flex" gap={8} styles={{ flexWrap: 'wrap' }}>
        {(Object.keys(TIERS) as TierKey[]).map((tierKey) => (
          <Button
            key={tierKey}
            text={`${TIERS[tierKey].icon}  ${t(`tiers.${TIER_I18N_KEY[tierKey]}.label`)}`}
            kind={tier === tierKey ? 'primary' : undefined}
            size="md"
            onClick={() => handleTierSwitch(tierKey)}
          />
        ))}
      </Box>

      {/* Vehicle New / Used Toggle */}
      {tier === 'vehicle' && (
        <Box
          display="flex"
          alignItems="center"
          gap={12}
          styles={{ flexWrap: 'wrap' }}
        >
          <Typography fontWeight={600}>{t('vehicleConditionLabel')}</Typography>
          <Box display="flex" gap={8}>
            <Button
              text={t('vehicleCondition.new')}
              kind={vehicleCondition === 'new' ? 'primary' : undefined}
              size="md"
              onClick={() => handleVehicleConditionSwitch('new')}
            />
            <Button
              text={t('vehicleCondition.used')}
              kind={vehicleCondition === 'used' ? 'primary' : undefined}
              size="md"
              onClick={() => handleVehicleConditionSwitch('used')}
            />
          </Box>
        </Box>
      )}

      {/* Input Card */}
      <Card gap={20} padding={20}>
        {/* Target Asset Price */}
        <Box display="flex" flexDirection="column" gap={6}>
          <Box display="flex" alignItems="center" gap={6}>
            <Typography
              as="label"
              fontWeight={600}
              color="var(--foreground, #1a1a1a)"
              styles={{ userSelect: 'none' }}
            >
              {t('priceLabelG')}
            </Typography>
            <ExplainBtn
              onClick={() =>
                openExplain(
                  'explain.priceLabelGTitle',
                  'explain.priceLabelGText',
                )
              }
            />
          </Box>
          <TextInput value={priceStr} onChange={setPriceStr} type="text" />
        </Box>

        {/* Term Slider */}
        <Box display="flex" flexDirection="column" gap={6}>
          <Box display="flex" alignItems="center" gap={6}>
            <Typography
              as="label"
              fontWeight={600}
              color="var(--foreground, #1a1a1a)"
              styles={{ userSelect: 'none' }}
            >
              {t('termLabel', { months, years: T.toFixed(1) })}
            </Typography>
            <ExplainBtn
              onClick={() =>
                openExplain('explain.termTitle', 'explain.termText')
              }
            />
          </Box>
          <Slider
            steps={monthSliderSteps}
            value={months}
            onChange={(v) => setMonths(Number(v))}
          />
        </Box>

        {/* Delta Slider */}
        <Box display="flex" flexDirection="column" gap={6}>
          <Box display="flex" alignItems="center" gap={6}>
            <Typography
              as="label"
              fontWeight={600}
              color="var(--foreground, #1a1a1a)"
              styles={{ userSelect: 'none' }}
            >
              {t('deltaLabel', { pct: (Number(delta) * 100).toFixed(1) })}
            </Typography>
            <ExplainBtn
              onClick={() =>
                openExplain('explain.deltaTitle', 'explain.deltaText')
              }
            />
          </Box>
          <Slider
            steps={deltaSliderSteps}
            value={delta}
            onChange={(v) => setDelta(Number(v))}
          />
        </Box>

        {/* Downpayment row */}
        <Box
          display="flex"
          flexDirection="row"
          justifyContent="space-between"
          alignItems="center"
          padding="10px 14px"
          borderRadius={6}
          backgroundColor="var(--surface-2)"
        >
          <Box display="flex" alignItems="center" gap={6}>
            <Typography color="var(--muted-foreground, #6b7280)">
              {t('downpaymentLabel')}
            </Typography>
            <ExplainBtn
              onClick={() =>
                openExplain(
                  'explain.downpaymentTitle',
                  'explain.downpaymentText',
                )
              }
            />
          </Box>
          <Typography fontWeight={600}>
            {(cfg.downpaymentPct * 100).toFixed(0)}%
            {G > 0 ? `  ·  ${fmtUSD.format(G * cfg.downpaymentPct)}` : ''}
          </Typography>
        </Box>
      </Card>

      {/* Results Card */}
      {result && G > 0 ? (
        <Card padding={0} styles={{ overflow: 'hidden' }}>
          {/* Results header */}
          <Box padding="12px 20px" backgroundColor="var(--accent, #06b6d4)">
            <Typography
              fontWeight={700}
              color="var(--accent-foreground, #fff)"
              styles={{
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}
            >
              {t('resultsHeading')}
            </Typography>
          </Box>

          {/* Result rows */}
          <ResultRow
            label={t('monthlyPayment')}
            value={fmtUSDCents.format(result.P)}
            highlight
            onExplain={() =>
              openExplain(
                'explain.monthlyPaymentTitle',
                'explain.monthlyPaymentText',
              )
            }
          />
          <ResultRow
            label={t('downpaymentRequired')}
            value={fmtUSD.format(result.downpayment)}
            shaded
            onExplain={() =>
              openExplain(
                'explain.downpaymentRequiredTitle',
                'explain.downpaymentRequiredText',
              )
            }
          />
          <ResultRow
            label={t('groupSize')}
            value={t('groupSizeValue', { n: result.N })}
            onExplain={() =>
              openExplain('explain.groupSizeTitle', 'explain.groupSizeText')
            }
          />
          <ResultRow
            label={t('assetPriceAtEnd', { years: T.toFixed(1) })}
            value={fmtUSD.format(result.G_final)}
            shaded
            onExplain={() =>
              openExplain(
                'explain.assetPriceAtEndTitle',
                'explain.assetPriceAtEndText',
              )
            }
          />
          <ResultRow
            label={t('totalContributed')}
            value={fmtUSD.format(result.totalPaid)}
            onExplain={() =>
              openExplain(
                'explain.totalContributedTitle',
                'explain.totalContributedText',
              )
            }
          />

          {/* Escrow progress bar (Tier 3 only) */}
          {cfg.escrowThreshold && escrowUnlockMonth && escrowPct !== null && (
            <Box
              display="flex"
              flexDirection="column"
              gap={8}
              padding="16px 20px"
              styles={{ borderTop: '1px solid var(--border, #e5e7eb)' }}
            >
              <Box
                display="flex"
                flexDirection="row"
                justifyContent="space-between"
                alignItems="center"
              >
                <Box display="flex" alignItems="center" gap={6}>
                  <Typography fontWeight={600}>{t('escrowHeading')}</Typography>
                  <ExplainBtn
                    onClick={() =>
                      openExplain('explain.escrowTitle', 'explain.escrowText')
                    }
                  />
                </Box>
                <Typography color="var(--muted-foreground, #6b7280)">
                  {t('escrowUnlocks', {
                    month: escrowUnlockMonth,
                    total: months,
                  })}
                </Typography>
              </Box>
              <ProgressBar
                value={escrowPct}
                size={8}
                label={t('escrowHeading')}
              />
              <Typography color="var(--muted-foreground, #6b7280)">
                {t('escrowNote')}
              </Typography>
            </Box>
          )}

          {/* Mitigation notice */}
          <Box
            padding="12px 20px"
            backgroundColor={MITIGATION_BG[cfg.mitigationKind]}
            styles={{ borderTop: '1px solid var(--border, #e5e7eb)' }}
          >
            <Typography color="var(--foreground)">
              {MITIGATION_ICON[cfg.mitigationKind]}{' '}
              {t(`tiers.${TIER_I18N_KEY[tier]}.mitigation`)}
            </Typography>
          </Box>
        </Card>
      ) : (
        <Card
          padding={32}
          alignItems="center"
          justifyContent="center"
          styles={{ textAlign: 'center' }}
        >
          <Typography color="var(--muted-foreground, #6b7280)">
            {t('emptyState')}
          </Typography>
        </Card>
      )}
    </Box>
  );
}

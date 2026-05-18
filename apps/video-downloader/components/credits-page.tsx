'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Button } from '@repo/ui/core-elements/button';
import { NavbarSpacer, PageBottomSpacer } from '@repo/ui/core-elements/navbar';
import { Container } from '@repo/ui/core-elements/container';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import { CREDIT_PACKS, type CreditPack } from '../lib/credit-packs';

const LS_KEY = 'vd_credits_key';

function PackButton({
  pack,
  isSelected,
  onSelect,
  creditsLabel,
}: {
  pack: CreditPack;
  isSelected: boolean;
  onSelect: (id: string) => void;
  creditsLabel: string;
}) {
  const price = (pack.priceCents / 100).toFixed(2);
  return (
    <button
      key={pack.id}
      type="button"
      onClick={() => onSelect(pack.id)}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        borderRadius: '8px',
        border: `2px solid ${isSelected ? 'var(--accent, #06b6d4)' : 'var(--border, #e5e7eb)'}`,
        background: 'var(--surface-1, #f9fafb)',
        cursor: 'pointer',
        width: '100%',
        textAlign: 'left',
      }}
    >
      <Box display="flex" flexDirection="column" gap={2}>
        <Typography variant="body-sm" fontWeight={700}>
          {pack.label}
        </Typography>
        <Typography variant="caption" color="var(--foreground-muted, #888)">
          {creditsLabel}
        </Typography>
      </Box>
      <Typography variant="body-sm" fontWeight={600}>
        ${price}
      </Typography>
    </button>
  );
}

export function CreditsPageContent() {
  const t = useTranslations('Credits');
  const locale = useLocale();
  const [mounted, setMounted] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [keyValue, setKeyValue] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [keyInput, setKeyInput] = useState('');
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const [selectedPack, setSelectedPack] = useState<string>('basic');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const fetchBalance = useCallback(async (key: string) => {
    try {
      const res = await fetch('/api/credits/balance', {
        headers: { 'x-credits-key': key },
      });
      if (res.ok) {
        const data = (await res.json()) as { credits: number };
        setBalance(data.credits);
      }
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    setMounted(true);

    const params = new URLSearchParams(window.location.search);
    const keyParam = params.get('credits_key');
    const creditsAdded = parseInt(params.get('credits_added') ?? '0', 10);

    if (keyParam) {
      localStorage.setItem(LS_KEY, keyParam);
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('credits_key');
      newUrl.searchParams.delete('credits_added');
      window.history.replaceState({}, '', newUrl.toString());
    }

    const key = localStorage.getItem(LS_KEY);
    if (!key) return;

    setHasKey(true);
    setKeyValue(key);
    void fetchBalance(key);

    if (creditsAdded > 0) {
      let attempts = 0;
      const poll = setInterval(() => {
        attempts++;
        void fetchBalance(key);
        if (attempts >= 10) clearInterval(poll);
      }, 1500);
      return () => clearInterval(poll);
    }
  }, [fetchBalance]);

  const handleCopyKey = useCallback(async () => {
    if (!keyValue) return;
    await navigator.clipboard.writeText(keyValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [keyValue]);

  const handleDeleteKey = useCallback(() => {
    localStorage.removeItem(LS_KEY);
    setHasKey(false);
    setKeyValue(null);
    setBalance(null);
    setShowKey(false);
    setShowDeleteModal(false);
  }, []);

  const handleRestore = useCallback(async () => {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    setRestoreLoading(true);
    setRestoreError(null);
    try {
      const res = await fetch('/api/credits/balance', {
        headers: { 'x-credits-key': trimmed },
      });
      if (!res.ok) {
        setRestoreError(t('restoreInvalidKey'));
        return;
      }
      const data = (await res.json()) as { credits: number };
      localStorage.setItem(LS_KEY, trimmed);
      setHasKey(true);
      setKeyValue(trimmed);
      setBalance(data.credits);
    } catch {
      setRestoreError(t('restoreError'));
    } finally {
      setRestoreLoading(false);
    }
  }, [keyInput, t]);

  const handleCheckout = useCallback(async () => {
    setCheckoutLoading(true);
    setCheckoutError(null);
    try {
      const existingKey = localStorage.getItem(LS_KEY) || undefined;
      const res = await fetch('/api/credits/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId: selectedPack, existingKey, locale }),
      });
      if (!res.ok) {
        setCheckoutError(t('purchaseError'));
        setCheckoutLoading(false);
        return;
      }
      const data = (await res.json()) as { url: string };
      window.location.href = data.url;
    } catch {
      setCheckoutError(t('purchaseError'));
    } finally {
      setCheckoutLoading(false);
    }
  }, [selectedPack, t]);

  if (!mounted) return null;

  return (
    <>
      <NavbarSpacer />
      <Container
        display="flex"
        justifyContent="center"
        paddingX={10}
        marginTop={24}
        marginBottom={24}
      >
        <Box maxWidth={400} width="100%">
          <Box
            elevation={4}
            borderRadius={16}
            padding={10}
            flexDirection="column"
            width="100%"
            backgroundColor="var(--surface-1, #fff)"
          >
            {!hasKey ? (
              <Box display="flex" flexDirection="column" gap={12}>
                <Box>
                  <Typography as="h1" variant="h5">
                    {t('purchaseTitle')}
                  </Typography>
                </Box>
                <Typography
                  variant="body-sm"
                  color="var(--foreground-muted, #888)"
                >
                  {t('purchaseText')}
                </Typography>
                {CREDIT_PACKS.map((pack) => (
                  <PackButton
                    key={pack.id}
                    pack={pack}
                    isSelected={selectedPack === pack.id}
                    onSelect={setSelectedPack}
                    creditsLabel={t('creditsCount', { credits: pack.credits })}
                  />
                ))}
                {checkoutError ? (
                  <Typography variant="caption" color="var(--error, #ef4444)">
                    {checkoutError}
                  </Typography>
                ) : null}
                <Typography
                  variant="caption"
                  color="var(--foreground-muted, #888)"
                >
                  {t('purchaseNote')}
                </Typography>
                <Button
                  text={checkoutLoading ? t('redirecting') : t('checkout')}
                  onClick={handleCheckout}
                  disabled={checkoutLoading}
                  width="100%"
                  kind="success"
                  size="md"
                />
                <Box
                  styles={{
                    borderTop: '1px solid var(--border, #e5e7eb)',
                    paddingTop: '12px',
                  }}
                >
                  <Typography
                    variant="body-sm"
                    fontWeight={600}
                    marginBottom={8}
                  >
                    {t('restoreTitle')}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="var(--foreground-muted, #888)"
                    marginBottom={8}
                  >
                    {t('restoreText')}
                  </Typography>
                </Box>
                <TextInput
                  label={t('restoreKeyLabel')}
                  value={keyInput}
                  onChange={setKeyInput}
                />
                {restoreError ? (
                  <Typography variant="caption" color="var(--error, #ef4444)">
                    {restoreError}
                  </Typography>
                ) : null}
                <Button
                  kind="success"
                  text={restoreLoading ? t('verifying') : t('restore')}
                  onClick={handleRestore}
                  disabled={restoreLoading || !keyInput.trim()}
                  width="100%"
                  size="md"
                />
              </Box>
            ) : (
              <Box display="flex" flexDirection="column" gap={12}>
                <Box
                  display="flex"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Typography as="h1" variant="h5">
                    {t('purchaseTitle')}
                  </Typography>
                  {balance !== null ? (
                    <Typography
                      variant="body-sm"
                      fontWeight={600}
                      styles={{ whiteSpace: 'nowrap' }}
                    >
                      {t('balanceLabel', { credits: balance })}
                    </Typography>
                  ) : null}
                </Box>

                <Box display="flex" flexDirection="column" gap={4}>
                  <Typography variant="body-sm" fontWeight={600}>
                    {t('keyLabel')}
                  </Typography>
                  <Box display="flex" alignItems="center" gap={4}>
                    <Box
                      styles={{
                        flex: 1,
                        fontFamily: 'monospace',
                        fontSize: '13px',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border, #e5e7eb)',
                        background: 'var(--surface-2, #f3f4f6)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: 'var(--foreground, #111)',
                        letterSpacing: showKey ? 'normal' : '3px',
                      }}
                    >
                      {showKey ? (keyValue ?? '') : '••••••••••••••••'}
                    </Box>
                    <Button
                      aria-label={t('copyKey')}
                      onClick={handleCopyKey}
                      borderRadius={6}
                      padding="6px"
                      icon="/icons/copy.svg"
                      iconSize="18px"
                      iconColor="var(--foreground, #171717)"
                      styles={{ flexShrink: 0, cursor: 'pointer' }}
                    />
                    <Button
                      aria-label={showKey ? t('hideKey') : t('revealKey')}
                      onClick={() => setShowKey((v) => !v)}
                      borderRadius={6}
                      padding="6px"
                      icon="/icons/show.svg"
                      iconSize="18px"
                      iconColor="var(--foreground, #171717)"
                      styles={{ flexShrink: 0, cursor: 'pointer' }}
                    />
                    <Button
                      aria-label={t('deleteKey')}
                      onClick={() => setShowDeleteModal(true)}
                      borderRadius={6}
                      padding="6px"
                      icon="/icons/delete-video.svg"
                      iconSize="18px"
                      iconColor="var(--foreground, #171717)"
                      styles={{ flexShrink: 0, cursor: 'pointer' }}
                    />
                  </Box>
                  {copied ? (
                    <Typography
                      variant="caption"
                      color="var(--success, #22c55e)"
                    >
                      {t('keyCopied')}
                    </Typography>
                  ) : null}
                </Box>

                <Box
                  styles={{ borderTop: '1px solid var(--border, #e5e7eb)' }}
                />

                <Typography
                  variant="body-sm"
                  color="var(--foreground-muted, #888)"
                >
                  {t('purchaseText')}
                </Typography>
                {CREDIT_PACKS.map((pack) => (
                  <PackButton
                    key={pack.id}
                    pack={pack}
                    isSelected={selectedPack === pack.id}
                    onSelect={setSelectedPack}
                    creditsLabel={t('creditsCount', { credits: pack.credits })}
                  />
                ))}
                {checkoutError ? (
                  <Typography variant="caption" color="var(--error, #ef4444)">
                    {checkoutError}
                  </Typography>
                ) : null}
                <Typography
                  variant="caption"
                  color="var(--foreground-muted, #888)"
                >
                  {t('purchaseNote')}
                </Typography>
                <Button
                  text={checkoutLoading ? t('redirecting') : t('checkout')}
                  onClick={handleCheckout}
                  disabled={checkoutLoading}
                  width="100%"
                  kind="success"
                  size="md"
                />
              </Box>
            )}
          </Box>
        </Box>
      </Container>
      <PageBottomSpacer />

      {showDeleteModal ? (
        <ConfirmationModal
          title={t('deleteKeyTitle')}
          text={t('deleteKeyText')}
          okCallback={handleDeleteKey}
          cancelCallback={() => setShowDeleteModal(false)}
        />
      ) : null}
    </>
  );
}

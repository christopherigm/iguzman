'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Button } from '@repo/ui/core-elements/button';
import { Box } from '@repo/ui/core-elements/box';

const TABS = ['getting-started', 'commands', 'services', 'tools', 'dev-cycle'] as const;
type Tab = (typeof TABS)[number];

interface TabMenuProps {
  labels: Record<Tab, string>;
}

export function TabMenu({ labels }: TabMenuProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const currentTab = (searchParams.get('tab') ?? 'getting-started') as Tab;

  const navigate = (tab: Tab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === 'getting-started') {
      params.delete('tab');
    } else {
      params.set('tab', tab);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <Box flexDirection="column" gap={4}>
      {TABS.map((tab) => {
        const isActive = currentTab === tab;
        return (
          <Button
            key={tab}
            text={labels[tab]}
            onClick={() => navigate(tab)}
            size="md"
            aria-pressed={isActive}
            display="flex"
            justifyContent="flex-start"
            width="100%"
            backgroundColor={isActive ? 'var(--accent)' : undefined}
            color={isActive ? 'var(--accent-foreground, #fff)' : undefined}
            marginBottom={10}
          />
        );
      })}
    </Box>
  );
}

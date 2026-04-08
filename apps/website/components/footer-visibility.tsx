'use client';

import { usePathname } from 'next/navigation';

type Props = {
  children: React.ReactNode;
};

export function FooterVisibility({ children }: Props) {
  const pathname = usePathname();
  if (pathname.includes('/admin')) return null;
  return <>{children}</>;
}

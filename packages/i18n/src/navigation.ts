import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

export const { redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);

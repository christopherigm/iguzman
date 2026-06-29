import type { ReactNode } from 'react';
import './tokens.css';

export type TvTextVariant = 'hero' | 'title' | 'body' | 'label';

export interface TvTextProps {
  variant?: TvTextVariant;
  children: ReactNode;
  className?: string;
}

/** 10-foot text scale. Sizing lives in tokens.css (.tv-text--*). */
export function TvText({ variant = 'body', children, className }: TvTextProps) {
  const cls = ['tv-text', `tv-text--${variant}`, className].filter(Boolean).join(' ');
  return <span className={cls}>{children}</span>;
}

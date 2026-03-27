'use client';

import { useEffect, useState } from 'react';
import './toast.css';
import { Box } from './box';
import { Typography } from './typography';

export type ToastVariant = 'error' | 'success';
export type ToastPosition =
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'top-left'
  | 'top-center'
  | 'top-right';

interface ToastProps {
  message: string;
  variant: ToastVariant;
  position?: ToastPosition;
  /** Seconds before the toast disappears. Pass 0 to never auto-dismiss. Default: 5 */
  duration?: number;
}

export function Toast({ message, variant, position = 'bottom-left', duration = 5 }: ToastProps) {
  const [phase, setPhase] = useState<'in' | 'out' | 'gone'>('in');

  const handleAnimationEnd = () => { if (phase === 'out') setPhase('gone'); };

  useEffect(() => {
    if (duration <= 0) return;
    const timer = setTimeout(() => setPhase('out'), duration * 1000);
    return () => clearTimeout(timer);
  }, [duration]);

  if (phase === 'gone') return null;

  return (
    <Box
      className={`ui-toast ui-toast--${variant} ui-toast--${position} ui-toast--${phase}`}
      role="alert"
      aria-live="polite"
      onClick={() => setPhase('out')}
      styles={{ pointerEvents: phase === 'in' ? 'auto' : 'none' }}
      onAnimationEnd={handleAnimationEnd}
    >
      <Typography variant="body-sm">{message}</Typography>
    </Box>
  );
}

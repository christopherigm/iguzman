'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Button } from '@repo/ui/core-elements/button';
import './favorite-button-client.css';

interface FavoriteButtonClientProps {
  label: string;
}

export function FavoriteButtonClient({ label }: FavoriteButtonClientProps) {
  const [active, setActive] = useState(false);

  return (
    <Button
      unstyled
      type="button"
      className={`favorite-btn${active ? ' favorite-btn--active' : ''}`}
      onClick={() => setActive((prev) => !prev)}
      aria-label={label}
      aria-pressed={active}
    >
      <Image
        src="/icons/favorite.svg"
        alt=""
        width={20}
        height={20}
        className="favorite-btn__icon"
      />
    </Button>
  );
}

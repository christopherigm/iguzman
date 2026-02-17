'use client';

import React, { useState, useEffect, useRef, CSSProperties } from 'react';
import Image from 'next/image';
import { UIComponentProps, buildStyleProps, type MenuItem } from './utils';
import { Icon } from './icon';
import { TextInput } from './text-input';
import './drawer.css';
import getImageDimensionsFromBase64 from '@repo/helpers/get-image-dimensions-from-base64';
import { ThemeSwitch } from '../theme-switch';
import { Box } from './box';

/**
 * Props for the `Drawer` component.
 */
export interface DrawerProps extends UIComponentProps {
  /** Controls drawer visibility. */
  open: boolean;
  /** Called when the drawer should close. */
  onClose: () => void;
  /** Menu items to display. */
  items: MenuItem[];
  /** Logo image src (rendered with next/Image). */
  logo: string;
  /** Alt text for the logo image. */
  logoAlt?: string;
  /** Logo width in pixels. Defaults to `120`. */
  logoWidth?: number;
  /** Logo height in pixels. Defaults to `40`. */
  logoHeight?: number;
  /** Version text displayed at the bottom. */
  version?: string;
  /** SVG path for the chevron icon. */
  chevronIcon?: string;
  /** SVG path for the close icon. */
  closeIcon?: string;
  /** Enable search in drawer. Defaults to `false`. */
  searchBox?: boolean;
  /** Callback fired when the user submits a search query. */
  onSearch?: (search: string) => void;
  /** SVG path for the search icon. */
  searchIcon?: string;
}

// ── DrawerItem ───────────────────────────────────────────────────────

const DrawerItem: React.FC<{
  item: MenuItem;
  depth?: number;
  onNavigate: () => void;
  chevronIcon?: string;
}> = ({ item, depth = 0, onNavigate, chevronIcon }) => {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = item.children && item.children.length > 0;

  const handleClick = () => {
    if (hasChildren) {
      setExpanded(!expanded);
    } else {
      item.onClick?.();
      onNavigate();
    }
  };

  const Tag = item.href && !hasChildren ? 'a' : 'button';
  const linkProps =
    Tag === 'a' ? { href: item.href } : { type: 'button' as const };

  return (
    <>
      <Tag
        className="ui-drawer-item"
        style={{ paddingLeft: 16 + depth * 16 }}
        onClick={handleClick}
        {...linkProps}
      >
        {item.icon && (
          <Icon icon={item.icon} size="20px" color="var(--foreground)" />
        )}
        <span className="ui-drawer-item-label">{item.label}</span>
        {hasChildren && (
          <Icon
            icon={chevronIcon || '/icons/chevron-down.svg'}
            size="16px"
            color="var(--foreground)"
            className={[
              'ui-drawer-chevron',
              expanded ? 'ui-drawer-chevron--open' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          />
        )}
      </Tag>
      {hasChildren && expanded && (
        <div className="ui-drawer-submenu">
          {item.children!.map((child) => (
            <DrawerItem
              key={child.label}
              item={child}
              depth={depth + 1}
              onNavigate={onNavigate}
              chevronIcon={chevronIcon}
            />
          ))}
        </div>
      )}
    </>
  );
};

// ── DrawerSearch ─────────────────────────────────────────────────────

const DrawerSearch: React.FC<{
  onSearch?: (value: string) => void;
  searchIcon?: string;
}> = ({ onSearch, searchIcon }) => {
  const [value, setValue] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && value.trim()) {
      onSearch?.(value.trim());
    }
  };

  return (
    <div className="ui-drawer-search">
      <TextInput
        value={value}
        onChange={setValue}
        placeholder="Search..."
        onKeyDown={handleKeyDown}
        minWidth={0}
        width="100%"
      />
    </div>
  );
};

// ── Drawer ───────────────────────────────────────────────────────────

/**
 * Drawer — full-height slide-in panel for mobile navigation.
 *
 * @example
 * <Drawer
 *   open={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   items={menuItems}
 *   logo="/logo.svg"
 *   version="v1.0.0"
 * />
 */
export const Drawer: React.FC<DrawerProps> = ({
  open,
  onClose,
  items,
  logo,
  logoAlt = '',
  logoWidth = 120,
  logoHeight = 40,
  version,
  chevronIcon,
  closeIcon,
  searchBox = false,
  onSearch,
  searchIcon,
  className,
  id,
  ...uiProps
}) => {
  const [computedLogoWidth, setComputedLogoWidth] = useState(logoWidth);
  const panelRef = useRef<HTMLElement>(null);

  // Calculate logo width from aspect ratio to preserve proportions
  useEffect(() => {
    let cancelled = false;
    getImageDimensionsFromBase64(logo)
      .then(({ aspectRatio }) => {
        if (!cancelled) {
          setComputedLogoWidth(Math.round(logoHeight * aspectRatio));
        }
      })
      .catch(() => {
        // If dimension detection fails (e.g. non-base64 src), fall back to logoWidth
        if (!cancelled) setComputedLogoWidth(logoWidth);
      });
    return () => {
      cancelled = true;
    };
  }, [logo, logoHeight, logoWidth]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  // Close when clicking on the overlay (outside the panel)
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  const safeStyle: CSSProperties = {
    ...buildStyleProps(uiProps as UIComponentProps),
    ...(uiProps as UIComponentProps).styles,
  };

  return (
    <div className="ui-drawer-overlay" onClick={handleOverlayClick}>
      <aside
        ref={panelRef}
        id={id}
        className={['ui-drawer-panel', className].filter(Boolean).join(' ')}
        style={safeStyle}
      >
        {/* Header: logo + close button */}
        <div className="ui-drawer-header">
          {logo && (
            <Image
              src={logo}
              alt={logoAlt}
              width={computedLogoWidth}
              height={logoHeight}
            />
          )}
          <button
            className="ui-drawer-close"
            onClick={onClose}
            aria-label="Close menu"
          >
            <Icon
              icon={closeIcon || '/icons/close.svg'}
              color="var(--foreground)"
              size="20px"
            />
          </button>
        </div>

        {/* Search */}
        {searchBox && (
          <DrawerSearch onSearch={onSearch} searchIcon={searchIcon} />
        )}

        {/* Menu items */}
        <nav className="ui-drawer-nav">
          {items.map((item) => (
            <DrawerItem
              key={item.label}
              item={item}
              onNavigate={onClose}
              chevronIcon={chevronIcon}
            />
          ))}
        </nav>

        <Box
          display="flex"
          justifyContent="center"
          width="100%"
          marginBottom={10}
        >
          <ThemeSwitch />
        </Box>
        {/* Footer: version */}
        {version && (
          <div className="ui-drawer-footer">
            <span className="ui-drawer-version">{version}</span>
          </div>
        )}
      </aside>
    </div>
  );
};

export default Drawer;

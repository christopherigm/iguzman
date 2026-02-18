'use client';

import React, { useState, useEffect, useRef, CSSProperties } from 'react';
import Image from 'next/image';
import { UIComponentProps, buildStyleProps, MenuItem } from './utils';
import { Container } from './container';
import { Icon } from './icon';
import { TextInput } from './text-input';
import { Drawer } from './drawer';
import getImageDimensionsFromBase64 from '@repo/helpers/get-image-dimensions-from-base64';
import './navbar.css';
import { Box } from './box';

export type { MenuItem };

/**
 * Props for the `Navbar` component.
 */
export interface NavbarProps extends UIComponentProps {
  /** Image src for the logo (rendered with next/Image). */
  logo: string;
  /** Alt text for the logo image. */
  logoAlt?: string;
  /** Logo width in pixels. Defaults to `120`. */
  logoWidth?: number;
  /** Logo height in pixels. Defaults to `40`. */
  logoHeight?: number;
  /** Menu items hidden at xs/sm, visible at md+. */
  items?: MenuItem[];
  /** Menu items visible at all breakpoints. */
  fixedItems?: MenuItem[];
  /** Enable the search box. Defaults to `false`. */
  searchBox?: boolean;
  /** Callback fired when the user submits a search query (Enter). */
  onSearch?: (search: string) => void;
  /** Callback fired on every keystroke in the search box (real-time). */
  onSearchChange?: (search: string) => void;
  /** Wrap inner content in a `Container`. Defaults to `true`. */
  container?: boolean;
  /** Set the navbar width to 100%. Defaults to `true`. */
  fullwidth?: boolean;
  /** Version text displayed at the bottom of the Drawer. */
  version?: string;
  /** SVG path for the hamburger icon. */
  hamburgerIcon?: string;
  /** SVG path for the search icon. */
  searchIcon?: string;
  /** SVG path for the close icon. */
  closeIcon?: string;
  /** SVG path for the chevron icon. */
  chevronIcon?: string;
}

// ── useScrollDirection ───────────────────────────────────────────────

function useScrollDirection(threshold = 5): 'up' | 'down' | null {
  const [direction, setDirection] = useState<'up' | 'down' | null>(null);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      if (
        Math.abs(currentY - lastScrollY.current) < threshold ||
        currentY < 300
      )
        return;
      setDirection(currentY > lastScrollY.current ? 'down' : 'up');
      lastScrollY.current = currentY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [threshold]);

  return direction;
}

// ── NavbarItem ───────────────────────────────────────────────────────

const NavbarItem: React.FC<{
  item: MenuItem;
  onToggleDropdown?: (label: string | null) => void;
  isDropdownOpen?: boolean;
  chevronIcon?: string;
}> = ({ item, onToggleDropdown, isDropdownOpen, chevronIcon }) => {
  const hasChildren = item.children && item.children.length > 0;

  const handleClick = () => {
    if (hasChildren && onToggleDropdown) {
      onToggleDropdown(isDropdownOpen ? null : item.label);
    } else if (item.onClick) {
      item.onClick();
    }
  };

  const Tag = item.href && !hasChildren ? 'a' : 'button';
  const linkProps =
    Tag === 'a' ? { href: item.href } : { type: 'button' as const };

  return (
    <Tag className="ui-navbar-item" onClick={handleClick} {...linkProps}>
      {item.icon && <Icon icon={item.icon} size="18px" />}
      {item.label}
      {hasChildren && (
        <Icon
          icon={chevronIcon || '/icons/chevron-down.svg'}
          size="14px"
          className={[
            'ui-navbar-item-chevron',
            isDropdownOpen ? 'ui-navbar-item-chevron--open' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        />
      )}
    </Tag>
  );
};

// ── DropdownPanel ────────────────────────────────────────────────────

const DropdownPanel: React.FC<{
  items: MenuItem[];
  onClose: () => void;
}> = ({ items, onClose }) => (
  <Box className="ui-navbar-dropdown">
    {items.map((child) => {
      const handleClick = () => {
        child.onClick?.();
        onClose();
      };

      const Tag = child.href ? 'a' : 'button';
      const linkProps =
        Tag === 'a' ? { href: child.href } : { type: 'button' as const };

      return (
        <Tag
          key={child.label}
          className="ui-navbar-dropdown-item"
          onClick={handleClick}
          {...linkProps}
        >
          {child.icon && <Icon icon={child.icon} size="18px" />}
          {child.label}
        </Tag>
      );
    })}
  </Box>
);

// ── SearchBox ────────────────────────────────────────────────────────

const SearchBox: React.FC<{
  onSearch?: (value: string) => void;
  onSearchChange?: (value: string) => void;
  searchIcon?: string;
  closeIcon?: string;
}> = ({ onSearch, onSearchChange, searchIcon, closeIcon }) => {
  const [expanded, setExpanded] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (expanded) {
      inputRef.current?.focus();
    }
  }, [expanded]);

  const handleChange = (v: string) => {
    setValue(v);
    onSearchChange?.(v);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && value.trim()) {
      onSearch?.(value.trim());
    }
    if (e.key === 'Escape') {
      setExpanded(false);
      setValue('');
      onSearchChange?.('');
      onSearch?.('');
    }
  };

  const handleClose = () => {
    setExpanded(false);
    setValue('');
    onSearchChange?.('');
    onSearch?.('');
  };

  return (
    <div className="ui-navbar-search">
      {!expanded && (
        <button
          className="ui-navbar-search-trigger"
          onClick={() => setExpanded(true)}
          aria-label="Search"
        >
          <Icon icon={searchIcon || '/icons/search.svg'} size="20px" />
        </button>
      )}
      <div
        className={[
          'ui-navbar-search-input',
          expanded ? 'ui-navbar-search-input--expanded' : '',
        ].join(' ')}
      >
        {expanded && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <TextInput
              ref={inputRef as React.Ref<HTMLInputElement>}
              value={value}
              onChange={handleChange}
              lable="Search"
              onKeyDown={handleKeyDown}
              minWidth={180}
            />
            <button
              className="ui-navbar-search-trigger"
              onClick={handleClose}
              aria-label="Close search"
            >
              <Icon icon={closeIcon || '/icons/close.svg'} size="18px" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Navbar ────────────────────────────────────────────────────────────

/**
 * Navbar — responsive navigation bar with scroll hide/show, menu items,
 * search box, and drawer integration.
 *
 * @example
 * <Navbar
 *   logo="/logo.svg"
 *   items={[{ label: 'Home', href: '/' }, { label: 'About', href: '/about' }]}
 *   fixedItems={[{ label: 'Login', onClick: () => {} }]}
 * />
 */
export const Navbar: React.FC<NavbarProps> = (props) => {
  const {
    logo,
    logoAlt = '',
    logoWidth = 120,
    logoHeight = 40,
    items = [],
    fixedItems = [],
    searchBox = false,
    onSearch,
    onSearchChange,
    container = true,
    fullwidth = true,
    version,
    hamburgerIcon,
    searchIcon,
    closeIcon,
    chevronIcon,
    className,
    id,
    ...uiProps
  } = props;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [computedLogoWidth, setComputedLogoWidth] = useState(logoWidth);
  const scrollDirection = useScrollDirection();
  const navRef = useRef<HTMLElement>(null);

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

  // Close dropdown on outside click
  useEffect(() => {
    if (!activeDropdown) return;
    const handler = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [activeDropdown]);

  const isHidden = scrollDirection === 'down';

  const navClasses = [
    'ui-navbar',
    isHidden ? 'ui-navbar--hidden' : '',
    fullwidth ? 'ui-navbar--fullwidth' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const navStyle: CSSProperties = {
    ...buildStyleProps(uiProps as UIComponentProps),
    ...(uiProps as UIComponentProps).styles,
  };

  const content = (
    <div className="ui-navbar-inner">
      {/* Logo */}
      <div className="ui-navbar-logo">
        <Image
          src={logo}
          alt={logoAlt}
          width={computedLogoWidth}
          height={logoHeight}
        />
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Regular menu items (hidden xs/sm) */}
      <div className="ui-navbar-menu">
        {items.map((item) => {
          const hasChildren = item.children && item.children.length > 0;
          return (
            <div key={item.label} className="ui-navbar-menu-item-wrapper">
              <NavbarItem
                item={item}
                onToggleDropdown={hasChildren ? setActiveDropdown : undefined}
                isDropdownOpen={activeDropdown === item.label}
                chevronIcon={chevronIcon}
              />
              {hasChildren && activeDropdown === item.label && (
                <DropdownPanel
                  items={item.children!}
                  onClose={() => setActiveDropdown(null)}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Fixed menu items (always visible) */}
      {fixedItems.length > 0 && (
        <div className="ui-navbar-fixed">
          {fixedItems.map((item) => (
            <NavbarItem key={item.label} item={item} />
          ))}
        </div>
      )}

      {/* Search */}
      {searchBox && (
        <SearchBox
          onSearch={onSearch}
          onSearchChange={onSearchChange}
          searchIcon={searchIcon}
          closeIcon={closeIcon}
        />
      )}

      {/* Hamburger (visible xs/sm) */}
      <button
        className="ui-navbar-hamburger"
        onClick={() => setDrawerOpen(true)}
        aria-label="Open menu"
      >
        <Icon icon={hamburgerIcon || '/icons/hamburger.svg'} size="24px" />
      </button>
    </div>
  );

  return (
    <>
      <nav ref={navRef} id={id} className={navClasses} style={navStyle}>
        {container ? <Container>{content}</Container> : content}
      </nav>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        items={[...items, ...fixedItems]}
        logo={logo}
        logoAlt={logoAlt}
        logoWidth={logoWidth}
        logoHeight={logoHeight}
        version={version}
        chevronIcon={chevronIcon}
        closeIcon={closeIcon}
        searchBox={searchBox}
        onSearch={onSearch}
        onSearchChange={onSearchChange}
        searchIcon={searchIcon}
      />
    </>
  );
};

export default Navbar;

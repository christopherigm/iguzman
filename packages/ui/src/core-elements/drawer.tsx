"use client";

import React, { useState, useEffect, useRef, CSSProperties } from "react";
import Image from "next/image";
import {
  UIComponentProps,
  buildStyleProps,
  menuItemKey,
  type MenuItem,
} from "./utils";
import { Icon } from "./icon";
import { TextInput } from "./text-input";
import "./drawer.css";
import getImageDimensionsFromBase64 from "@repo/helpers/get-image-dimensions-from-base64";
import { ThemeSwitch } from "../theme-switch";
import { LocaleSwitcher } from "./locale-switcher";
import { Box } from "./box";
import { useScrollLock } from "./use-scroll-lock";

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
  /** SVG path for the close icon. */
  closeIcon?: string;
  /** Enable search in drawer. Defaults to `false`. */
  searchBox?: boolean;
  /** Callback fired when the user submits a search query. */
  onSearch?: (search: string) => void;
  /** Callback fired on every keystroke in the search box (real-time). */
  onSearchChange?: (search: string) => void;
  /** SVG path for the search icon. */
  searchIcon?: string;
  /** Controlled search value (e.g. a voice transcript). Fills the search box when set. */
  searchValue?: string;
  /** Enable theme switch in drawer. Defaults to `false`. */
  themeSwitch?: boolean;
  /**
   * All available locale codes. Passed together with `currentLocale`, the
   * drawer renders a `LocaleSwitcher` beside the theme switch.
   *
   * ⚠ **Pass the consuming app's own locale set, never
   * `@repo/i18n/routing`'s.** `apps/help` deliberately ships two locales where
   * the shared config ships five, so this package must not reach for that
   * config itself - the caller is the only one that knows which set applies.
   */
  locales?: readonly string[];
  /** The active locale code. Both it and `locales` are needed to render a switcher. */
  currentLocale?: string;
}

// ── DrawerItem ───────────────────────────────────────────────────────

/** One entry. Every entry in the drawer is one of these, at one indentation -
 *  a child of a parent item is drawn exactly like a top-level one. */
const DrawerItem: React.FC<{
  item: MenuItem;
  onNavigate: () => void;
}> = ({ item, onNavigate }) => {
  const handleClick = () => {
    item.onClick?.();
    onNavigate();
  };

  const Tag = item.href ? "a" : "button";
  const linkProps =
    Tag === "a" ? { href: item.href } : { type: "button" as const };

  return (
    <Tag
      className="ui-drawer-item"
      onClick={handleClick}
      aria-label={item.ariaLabel}
      {...linkProps}
    >
      {item.icon && (
        <Icon icon={item.icon} size="20px" color="var(--foreground)" />
      )}
      <span className="ui-drawer-item-label">{item.label}</span>
    </Tag>
  );
};

// ── DrawerGroup ──────────────────────────────────────────────────────

/**
 * A parent item's children, rendered **flat**: a quiet title over a rule, then
 * the children at the same indentation as every other entry. Nothing here
 * expands, deliberately - the drawer is a full-height panel with room to show
 * the whole menu at once, and an accordion put a tap in front of exactly the
 * entries the reader opened the drawer to reach (a tenant's menu categories,
 * say), while saying nothing about what was behind it.
 *
 * The parent's own `href` is dropped, as the expanding version also dropped it:
 * a parent with children renders as a toggle in the bar too, and where its own
 * page matters it is repeated as the group's first child ("All", "Full menu").
 */
const DrawerGroup: React.FC<{
  item: MenuItem;
  onNavigate: () => void;
}> = ({ item, onNavigate }) => (
  <div className="ui-drawer-group">
    {item.label && <span className="ui-drawer-group-title">{item.label}</span>}
    <DrawerItems items={item.children!} onNavigate={onNavigate} />
  </div>
);

/** A list of entries, each either a leaf or a titled group of its own. A
 *  function declaration so `DrawerGroup` above can recurse into it. */
function DrawerItems({
  items,
  onNavigate,
}: {
  items: MenuItem[];
  onNavigate: () => void;
}) {
  return (
    <>
      {items.map((item, index) =>
        item.children && item.children.length > 0 ? (
          <DrawerGroup
            key={menuItemKey(item, index)}
            item={item}
            onNavigate={onNavigate}
          />
        ) : (
          <DrawerItem
            key={menuItemKey(item, index)}
            item={item}
            onNavigate={onNavigate}
          />
        ),
      )}
    </>
  );
}

// ── DrawerSearch ─────────────────────────────────────────────────────

const DrawerSearch: React.FC<{
  onSearch?: (value: string) => void;
  onSearchChange?: (value: string) => void;
  searchIcon?: string;
  externalValue?: string;
}> = ({ onSearch, onSearchChange, externalValue }) => {
  const [value, setValue] = useState("");
  const prevExternalRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (externalValue) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(externalValue);
      onSearchChange?.(externalValue);
    } else if (externalValue === "" && prevExternalRef.current) {
      setValue("");
    }
    prevExternalRef.current = externalValue;
  }, [externalValue, onSearchChange]);

  const handleChange = (v: string) => {
    setValue(v);
    onSearchChange?.(v);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && value.trim()) {
      onSearch?.(value.trim());
    }
  };

  return (
    <div className="ui-drawer-search">
      <TextInput
        value={value}
        onChange={handleChange}
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
 * Drawer - full-height slide-in panel for mobile navigation.
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
  logoAlt = "",
  logoWidth = 120,
  logoHeight = 40,
  version,
  closeIcon,
  searchBox = false,
  onSearch,
  onSearchChange,
  searchIcon,
  searchValue,
  className,
  id,
  themeSwitch = true,
  locales,
  currentLocale,
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

  // Freeze the page behind the drawer while it is open. This used to be a local
  // `document.body.style.overflow`, which locked the wrong element - `<html>` is
  // the scroll container in every app whose `globals.css` sets
  // `html { overflow-x: hidden }`, i.e. all of them - and blanked the value on
  // cleanup rather than restoring it. See `useScrollLock`; it is also
  // reference-counted, so a `ConfirmationModal` opened from a drawer item no
  // longer hands scrolling back when only the dialog closes.
  useScrollLock(open);

  if (!open) return null;

  // Close when clicking on the overlay (outside the panel)
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  // Rendered only when the caller supplied both halves - a switcher that could
  // name one locale is a control with nothing to switch between.
  const localeSwitcher =
    locales && locales.length > 0 && currentLocale ? (
      <LocaleSwitcher locales={locales} currentLocale={currentLocale} />
    ) : null;

  const safeStyle: CSSProperties = {
    ...buildStyleProps(uiProps as UIComponentProps),
    ...(uiProps as UIComponentProps).styles,
  };

  return (
    <div className="ui-drawer-overlay" onClick={handleOverlayClick}>
      <aside
        ref={panelRef}
        id={id}
        className={["ui-drawer-panel", className].filter(Boolean).join(" ")}
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
              icon={closeIcon || "/icons/close.svg"}
              color="var(--foreground)"
              size="20px"
            />
          </button>
        </div>

        {/* Search */}
        {searchBox && (
          <DrawerSearch
            onSearch={onSearch}
            onSearchChange={onSearchChange}
            searchIcon={searchIcon}
            externalValue={searchValue}
          />
        )}

        {/* Menu items */}
        <nav className="ui-drawer-nav">
          <DrawerItems items={items} onNavigate={onClose} />
        </nav>

        {/* Theme and language sit on one row, spaced evenly - the two
            preferences a reader sets about the app rather than navigates to. */}
        {(themeSwitch || localeSwitcher) && (
          <Box
            display="flex"
            justifyContent="space-evenly"
            alignItems="center"
            width="100%"
            marginBottom={10}
          >
            {themeSwitch && <ThemeSwitch />}
            {localeSwitcher}
          </Box>
        )}
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

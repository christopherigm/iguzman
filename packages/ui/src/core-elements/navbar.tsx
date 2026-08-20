"use client";

import React, { useState, useEffect, useRef, CSSProperties } from "react";
import Image from "next/image";
import { Link, usePathname } from "@repo/i18n/navigation";
import {
  UIComponentProps,
  buildStyleProps,
  MenuItem,
  BREAKPOINTS,
  menuItemKey,
} from "./utils";
import { Badge } from "./badge";
import { Container } from "./container";
import { Icon } from "./icon";
import { TextInput } from "./text-input";
import { Drawer } from "./drawer";
import getImageDimensionsFromBase64 from "@repo/helpers/get-image-dimensions-from-base64";
import { subscribeToProgrammaticScroll } from "./scroll-to";
import "./navbar.css";
import { Box } from "./box";

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
  /** Enable theme switch in drawer. Defaults to `false`. */
  themeSwitch?: boolean;
  /** Make the navbar background semi-transparent with a backdrop blur. Defaults to `false`. */
  translucent?: boolean;
  /**
   * Controlled search value. When set, expands the search box and fills it
   * with this text (e.g. a voice-search transcript).  Requires `searchBox`.
   */
  searchValue?: string;
  /**
   * Optional node rendered immediately *before* the fixed items - so it leads
   * the always-visible controls rather than trailing them. For an action that
   * belongs with them but outranks them (a labelled cart button beside the
   * favorites and account icons); `rightSlot` is the trailing counterpart.
   */
  actionSlot?: React.ReactNode;
  /**
   * Optional node rendered to the right of the search box and to the left
   * of the hamburger icon (e.g. an action button).
   */
  rightSlot?: React.ReactNode;
  /**
   * List of path strings where the navbar (and drawer) should not be rendered.
   * Uses exact matching against the value returned by `usePathname`.
   */
  hiddenPaths?: string[];
}

// ── useScrollDirection ───────────────────────────────────────────────

function useScrollDirection(threshold = 5): "up" | "down" | null {
  const [direction, setDirection] = useState<"up" | "down" | null>(null);
  const lastScrollY = useRef(0);
  // True while the *app* is scrolling the page - a jump-list entry pressed, a
  // page opening on something other than its own top. See the effect below.
  const programmatic = useRef(false);
  const pathname = usePathname();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDirection(null);
    lastScrollY.current = 0;
  }, [pathname]);

  // A scroll the app started is not the reader asking for more room. Pressing
  // an entry in a menu's category index travels *down* the page, which is
  // exactly the gesture that hides this bar - so the reader landed where they
  // asked to be with the navigation they were using swiped off the screen. For
  // the length of such a travel the direction is left alone, and the bar is
  // shown again once the page has stopped moving (a bar hidden *before* the
  // press comes back with it, which is the whole point).
  //
  // ⚠ Only scrolls that opted in through `scroll-to`'s `revealNavbar` are
  // announced, so nothing changes for an app that never passes it.
  useEffect(
    () =>
      subscribeToProgrammaticScroll((phase) => {
        programmatic.current = phase === "start";
        if (phase === "end") {
          lastScrollY.current = window.scrollY;
          setDirection(null);
        }
      }),
    [],
  );

  useEffect(() => {
    const handleScroll = () => {
      // Disable hide-on-scroll at sm breakpoint (600px) and above
      if (window.innerWidth >= BREAKPOINTS.sm) {
        setDirection(null);
        return;
      }
      const currentY = window.scrollY;
      // The app is driving: follow the page without forming an opinion about
      // it, so the reader's next real gesture is measured from where they
      // actually are rather than from where they were before the jump.
      if (programmatic.current) {
        lastScrollY.current = currentY;
        return;
      }
      // Always show navbar near the top and keep the reference current so that
      // fast upward scrolls past this boundary don't leave lastScrollY stale.
      if (currentY < 300) {
        setDirection(null);
        lastScrollY.current = currentY;
        return;
      }
      if (Math.abs(currentY - lastScrollY.current) < threshold) return;
      setDirection(currentY > lastScrollY.current ? "down" : "up");
      lastScrollY.current = currentY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [threshold]);

  return direction;
}

// ── Item helpers ─────────────────────────────────────────────────────

/** What the item's badge shows, or `null` for nothing. A count of `0` is not
 *  worth a chip, and anything past 99 is capped so the badge stays small. */
function badgeLabel(badge: MenuItem["badge"]): string | null {
  if (badge === undefined || badge === 0 || badge === "") return null;
  if (typeof badge === "number") return badge > 99 ? "99+" : String(badge);
  return badge;
}

// ── NavbarItem ───────────────────────────────────────────────────────

const NavbarItem: React.FC<{
  item: MenuItem;
  onToggleDropdown?: () => void;
  isDropdownOpen?: boolean;
  isActive?: boolean;
  chevronIcon?: string;
}> = ({ item, onToggleDropdown, isDropdownOpen, isActive, chevronIcon }) => {
  const hasChildren = item.children && item.children.length > 0;

  const handleClick = () => {
    if (hasChildren && onToggleDropdown) {
      onToggleDropdown();
    } else if (item.onClick) {
      item.onClick();
    }
  };

  // An item with an icon and no label carries its badge over the icon's corner
  // instead of after the text - there is no text for it to follow.
  const iconOnly = !item.label && !!item.icon;
  const badge = badgeLabel(item.badge);

  const itemClassName = [
    "ui-navbar-item",
    iconOnly ? "ui-navbar-item--icon-only" : "",
    isActive ? "ui-navbar-item--active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {item.icon && (
        <Icon icon={item.icon} size="18px" className="ui-navbar-item-icon" />
      )}
      {item.label}
      {badge !== null && (
        <Badge size="sm" circular className="ui-navbar-item-badge">
          {badge}
        </Badge>
      )}
      {hasChildren && (
        <Icon
          icon={chevronIcon || "/icons/chevron-down.svg"}
          size="14px"
          className={[
            "ui-navbar-item-chevron",
            isDropdownOpen ? "ui-navbar-item-chevron--open" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        />
      )}
    </>
  );

  const shared = {
    className: itemClassName,
    onClick: handleClick,
    "aria-current": isActive ? ("page" as const) : undefined,
    "aria-label": item.ariaLabel,
    title: item.ariaLabel,
  };

  // A navigating item is a `Link`, never a bare `<a>`. Menu hrefs are written
  // locale-less (`/animals`, `/account`), so a plain anchor would leave the
  // prefix to the proxy - which resolves it from the `NEXT_LOCALE` cookie and
  // lands the reader in whichever locale that cookie last recorded. `Link`
  // prefixes the locale actually being rendered. See `@repo/i18n/navigation`.
  if (item.href && !hasChildren) {
    return (
      <Link href={item.href} prefetch {...shared}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" {...shared}>
      {content}
    </button>
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

      const content = (
        <>
          {child.icon && <Icon icon={child.icon} size="18px" />}
          {child.label}
        </>
      );

      // Same reasoning as `NavbarItem`: a locale-less href on a bare `<a>`
      // resolves through the cookie, not through the page being rendered.
      return child.href ? (
        <Link
          key={child.label}
          href={child.href}
          prefetch
          className="ui-navbar-dropdown-item"
          onClick={handleClick}
        >
          {content}
        </Link>
      ) : (
        <button
          key={child.label}
          type="button"
          className="ui-navbar-dropdown-item"
          onClick={handleClick}
        >
          {content}
        </button>
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
  externalValue?: string;
}> = ({ onSearch, onSearchChange, searchIcon, closeIcon, externalValue }) => {
  const [expanded, setExpanded] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const prevExternalRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (expanded) {
      inputRef.current?.focus();
    }
  }, [expanded]);

  // Sync an externally-controlled value (e.g. voice transcript) into the box.
  // Also clears the box when the value transitions from non-empty back to ''.
  useEffect(() => {
    if (externalValue) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpanded(true);
      setValue(externalValue);
      onSearchChange?.(externalValue);
    } else if (externalValue === "" && prevExternalRef.current) {
      setValue("");
      setExpanded(false);
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
    if (e.key === "Escape") {
      setExpanded(false);
      setValue("");
      onSearchChange?.("");
      onSearch?.("");
    }
  };

  const handleClose = () => {
    setExpanded(false);
    setValue("");
    onSearchChange?.("");
    onSearch?.("");
  };

  return (
    <div className="ui-navbar-search">
      {!expanded && (
        <button
          className="ui-navbar-search-trigger"
          onClick={() => setExpanded(true)}
          aria-label="Search"
        >
          <Icon icon={searchIcon || "/icons/search.svg"} size="20px" />
        </button>
      )}
      <div
        className={[
          "ui-navbar-search-input",
          expanded ? "ui-navbar-search-input--expanded" : "",
        ].join(" ")}
      >
        {expanded && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <TextInput
              ref={inputRef as React.Ref<HTMLInputElement>}
              value={value}
              onChange={handleChange}
              label="Search"
              onKeyDown={handleKeyDown}
              minWidth={180}
            />
            <button
              className="ui-navbar-search-trigger"
              onClick={handleClose}
              aria-label="Close search"
            >
              <Icon icon={closeIcon || "/icons/close.svg"} size="18px" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Navbar ────────────────────────────────────────────────────────────

/**
 * Navbar - responsive navigation bar with scroll hide/show, menu items,
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
    logoAlt = "",
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
    themeSwitch = true,
    translucent = false,
    searchValue,
    actionSlot,
    rightSlot,
    hiddenPaths,
    ...uiProps
  } = props;

  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [computedLogoWidth, setComputedLogoWidth] = useState(logoWidth);
  const scrollDirection = useScrollDirection();
  const navRef = useRef<HTMLElement>(null);
  const activeDropdownWrapperRef = useRef<HTMLDivElement | null>(null);

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

  // Close dropdown when clicking outside the active dropdown wrapper
  useEffect(() => {
    if (activeDropdown === null) return;
    const handler = (e: MouseEvent) => {
      if (
        activeDropdownWrapperRef.current &&
        !activeDropdownWrapperRef.current.contains(e.target as Node)
      ) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [activeDropdown]);

  // Already locale-less: next-intl's `usePathname` strips the prefix for us, so
  // this no longer chops the first segment off by regex - which mangled any
  // top-level route that happened to be two letters long.
  if (hiddenPaths?.includes(pathname)) return null;

  // An item is active when its href matches the current path. The home item
  // ("/") only matches exactly; other items also match nested sub-paths. A
  // dropdown parent is active whenever any of its children is - its own href is
  // often a landing page beside the children rather than above them (or absent
  // entirely, since a parent renders as a button), so matching on the parent
  // alone would leave the bar unmarked on the very pages it groups.
  const isItemActive = (item: MenuItem): boolean => {
    if (item.children?.some(isItemActive)) return true;
    if (!item.href) return false;
    if (item.href === "/") return pathname === "/";
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  const isHidden = scrollDirection === "down";

  const navClasses = [
    "ui-navbar",
    isHidden ? "ui-navbar--hidden" : "",
    fullwidth ? "ui-navbar--fullwidth" : "",
    translucent ? "ui-navbar--translucent" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const navStyle: CSSProperties = {
    ...buildStyleProps(uiProps as UIComponentProps),
    ...(uiProps as UIComponentProps).styles,
  };

  const content = (
    <div className="ui-navbar-inner">
      {/* Logo */}
      <div className="ui-navbar-logo">
        <Link href="/" prefetch>
          <Image
            src={logo}
            alt={logoAlt}
            width={computedLogoWidth}
            height={logoHeight}
          />
        </Link>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Regular menu items (hidden xs/sm) */}
      <div className="ui-navbar-menu">
        {items.map((item, index) => {
          const hasChildren = item.children && item.children.length > 0;
          const key = menuItemKey(item, index);
          const isOpen = activeDropdown === key;
          return (
            <div
              key={key}
              className="ui-navbar-menu-item-wrapper"
              ref={isOpen ? activeDropdownWrapperRef : undefined}
            >
              <NavbarItem
                item={item}
                onToggleDropdown={
                  hasChildren
                    ? () => setActiveDropdown(isOpen ? null : key)
                    : undefined
                }
                isDropdownOpen={isOpen}
                isActive={isItemActive(item)}
                chevronIcon={chevronIcon}
              />
              {hasChildren && isOpen && (
                <DropdownPanel
                  items={item.children!}
                  onClose={() => setActiveDropdown(null)}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Action slot (caller-supplied, leads the fixed items) */}
      {actionSlot}

      {/* Fixed menu items (always visible) */}
      {fixedItems.length > 0 && (
        <div className="ui-navbar-fixed">
          {fixedItems.map((item, index) => {
            const hasChildren = item.children && item.children.length > 0;
            const key = menuItemKey(item, index);
            const isOpen = activeDropdown === key;
            return (
              <div
                key={key}
                className="ui-navbar-menu-item-wrapper"
                ref={isOpen ? activeDropdownWrapperRef : undefined}
              >
                <NavbarItem
                  item={item}
                  onToggleDropdown={
                    hasChildren
                      ? () => setActiveDropdown(isOpen ? null : key)
                      : undefined
                  }
                  isDropdownOpen={isOpen}
                  isActive={isItemActive(item)}
                  chevronIcon={chevronIcon}
                />
                {hasChildren && isOpen && (
                  <DropdownPanel
                    items={item.children!}
                    onClose={() => setActiveDropdown(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Search */}
      {searchBox && (
        <SearchBox
          onSearch={onSearch}
          onSearchChange={onSearchChange}
          searchIcon={searchIcon}
          closeIcon={closeIcon}
          externalValue={searchValue}
        />
      )}

      {/* Right slot (caller-supplied action) */}
      {rightSlot}

      {/* Hamburger (visible xs/sm) */}
      <button
        className="ui-navbar-hamburger"
        onClick={() => setDrawerOpen(true)}
        aria-label="Open menu"
      >
        <Icon icon={hamburgerIcon || "/icons/hamburger.svg"} size="24px" />
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
        items={items}
        logo={logo}
        logoAlt={logoAlt}
        logoWidth={logoWidth}
        logoHeight={logoHeight}
        version={version}
        closeIcon={closeIcon}
        searchBox={searchBox}
        onSearch={onSearch}
        onSearchChange={onSearchChange}
        searchIcon={searchIcon}
        searchValue={searchValue}
        themeSwitch={themeSwitch}
      />
    </>
  );
};

/**
 * NavbarSpacer - a `div` with `height: var(--ui-navbar-height)` that pushes
 * page content below the fixed navbar.  Use it on any page that does not
 * start with a full-width `<Hero>` section.
 */
export const NavbarSpacer: React.FC = () => (
  <div className="ui-navbar-spacer" />
);

/**
 * PageBottomSpacer - a `div` with `height: var(--ui-page-bottom-spacing)`
 * (default 64 px) that adds breathing room at the bottom of page content.
 * Place it as the last element inside the page's root fragment.
 */
export const PageBottomSpacer: React.FC = () => (
  <div className="ui-page-bottom-spacer" />
);

export default Navbar;

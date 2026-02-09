'use client';

import { ReactNode, useState, MouseEvent, useEffect } from 'react';
import { Box, Typography, useMediaQuery, useTheme } from '@mui/material';
import Button from '@mui/material/Button';
import { usePathname } from 'next/navigation';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Link from 'next/link';
import ListItemText from '@mui/material/ListItemText';
import HorizontalDivisor from '@iguzman/ui/HorizontalDivisor/index';

/**
 * Props for a navigation item
 */
type NavItemProps = {
  /**
   * The text content of the navigation item
   */
  children: ReactNode;
  /**
   * The URL to navigate to (optional)
   */
  href?: string;
  /**
   * Callback function to execute when clicked (optional)
   */
  callback?: () => void;
  /**
   * Icon component to display (optional)
   */
  icon?: ReactNode;
  /**
   * Whether the item is currently selected (optional)
   */
  selected?: boolean;
  /**
   * Array of submenu items (optional)
   */
  subMenus?: Array<NavItemProps>;
  /**
   * Primary color for styling (optional)
   */
  primaryColor?: string;
  /**
   * Whether the navigation bar is in dark mode (optional)
   */
  darkNavBar?: boolean;
};

/**
 * Constants for styling
 */
const SELECTED_STYLE = {
  textTransform: 'initial' as const,
  textShadow: '0 0 1px rgba(255,255,255,0.4)',
};

const ICON_STYLE = {
  display: {
    xs: 'contents',
    sm: 'none',
    md: 'contents',
  },
};

const MENU_ITEM_STYLE = {
  textDecoration: 'none' as const,
  color: 'inherit' as const,
};

/**
 * Container component for links
 */
const LinkContainer = ({
  children,
  href,
}: {
  children: ReactNode;
  href?: string;
}) => {
  if (href) {
    return (
      <Link
        href={href}
        style={{
          width: '100%',
        }}
        prefetch
      >
        {children}
      </Link>
    );
  }
  return <>{children}</>;
};

/**
 * Navigation item component
 * @param props - The props for the navigation item
 * @returns The rendered navigation item
 *
 * @example
 * ```tsx
 * <NavItem href="/dashboard" icon={<DashboardIcon />}>
 *   Dashboard
 * </NavItem>
 * ```
 */
const NavItem = ({
  children,
  href,
  callback,
  icon,
  selected = false,
  subMenus = [],
}: NavItemProps): ReactNode => {
  const theme = useTheme();
  const notXS = useMediaQuery(theme.breakpoints.not('xs'));
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [isSelected, setIsSelected] = useState<boolean>(selected);
  const [isHome, setIsHome] = useState<boolean>(false);
  const open = Boolean(anchorEl);
  const pathname = usePathname();

  useEffect(() => {
    setIsSelected(pathname === href);
    setIsHome(pathname === href && pathname === '/');
  }, [pathname, href]);

  const Icon = <Box sx={ICON_STYLE}>{icon}</Box>;

  const RegularButton = (
    <LinkContainer href={href}>
      {notXS ? (
        <Button
          variant="text"
          startIcon={icon ? Icon : null}
          sx={SELECTED_STYLE}
          fullWidth
        >
          <Typography
            color="textPrimary"
            fontWeight={isSelected ? 'bold' : 'normal'}
            borderBottom={isSelected ? '2px solid' : ''}
            borderColor="primary"
          >
            {children}
          </Typography>
        </Button>
      ) : (
        <Box display="flex" flexDirection="column" width="100%">
          <Button
            variant="text"
            sx={{
              ...SELECTED_STYLE,
              display: 'flex',
              paddingX: 2,
            }}
            fullWidth
          >
            <Typography
              color="textPrimary"
              fontWeight={isSelected ? 'bold' : 'normal'}
              borderBottom={isSelected ? '2px solid' : ''}
              borderColor="primary"
            >
              {children}
            </Typography>
            <Box flexGrow={1} />
            <Box
              display="flex"
              alignItems="center"
              color={isSelected ? 'primary' : 'textPrimary'}
            >
              {icon}
            </Box>
          </Button>
          <HorizontalDivisor margin={1} />
        </Box>
      )}
    </LinkContainer>
  );

  const MenuButton = (
    <Button
      variant="text"
      startIcon={Icon}
      sx={SELECTED_STYLE}
      id="basic-button"
      aria-controls={open ? 'basic-menu' : undefined}
      aria-haspopup="true"
      aria-expanded={open ? 'true' : undefined}
      onClick={(event: MouseEvent<HTMLElement>) =>
        setAnchorEl(event.currentTarget)
      }
    >
      {children}
    </Button>
  );

  // If this is a home item, don't render anything
  if (isHome) {
    return null;
  }

  return (
    <Box display="flex" alignItems="center">
      {href ? (
        RegularButton
      ) : callback ? (
        <Button
          variant="text"
          startIcon={icon}
          sx={SELECTED_STYLE}
          onClick={callback}
        >
          {children}
        </Button>
      ) : subMenus && subMenus.length > 0 ? (
        <>
          {MenuButton}
          <Menu
            id="basic-menu"
            anchorEl={anchorEl}
            open={open}
            onClose={() => setAnchorEl(null)}
            MenuListProps={{
              'aria-labelledby': 'basic-button',
            }}
          >
            {subMenus.map((item, index) => (
              <MenuItem key={index} onClick={() => setAnchorEl(null)}>
                {item.href ? (
                  <Link href={item.href} style={MENU_ITEM_STYLE}>
                    {item.children}
                  </Link>
                ) : item.callback ? (
                  <Button
                    onClick={() => {
                      item.callback?.();
                      setAnchorEl(null);
                    }}
                  >
                    {item.children}
                  </Button>
                ) : (
                  <ListItemText primary={item.children} />
                )}
              </MenuItem>
            ))}
          </Menu>
        </>
      ) : null}

      <Box
        height={30}
        borderRight="1px solid #bbb"
        display={{
          xs: 'none',
          sm: 'initial',
        }}
      />
    </Box>
  );
};

export default NavItem;

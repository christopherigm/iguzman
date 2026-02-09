import { ReactNode } from 'react';
import { Breakpoint } from '@mui/material/styles';
import NavBar from './nav-bar';
import Footer from './footer';
import type MetaTagsProps from '@repo/interfaces/meta-tags-props';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import ThemeOverride from '@repo/ui/theme-override';

import PagePaddingTop from '@repo/ui/page-padding-top';
import PagePaddingBottom from '@repo/ui/page-padding-bottom';

import NextJSProgressBarProvider from '@repo/ui/nextjs-progress-bar';
import InitColorSchemeScript from '@mui/material/InitColorSchemeScript';

export type DefaultLayoutProps = {
  children?: any;
  isLoading?: boolean;
  persistentMenu?: any;
  menu?: ReactNode;
  maxWidth?: Breakpoint | false;
  maxWidthNavBar?: Breakpoint | false;
  drawerMenu?: ReactNode;
  onSearch?: (value: string) => void;
  metaTagsProps?: MetaTagsProps;
};

const DefaultLayout = ({
  children,
  persistentMenu,
  menu,
  maxWidth = 'lg',
  maxWidthNavBar = 'lg',
  drawerMenu,
  onSearch,
  metaTagsProps,
}: DefaultLayoutProps) => {
  const navProps = {
    ...metaTagsProps,
    drawerMenu: drawerMenu ?? menu,
    persistentMenu,
  };

  return (
    <>
      <head>
        <InitColorSchemeScript attribute="class" />
      </head>
      <body
        style={{
          display: 'flex',
          flexDirection: 'column',
          // justifyContent: 'space-between',
          minHeight: '100vh',
        }}
      >
        <header>
          <NavBar {...navProps}>{menu}</NavBar>
          <NextJSProgressBarProvider />
        </header>
        {maxWidth ? (
          <Container maxWidth={maxWidth}>
            {metaTagsProps?.topPadding ? <PagePaddingTop /> : null}
            {children}
            {metaTagsProps?.topPadding ? <PagePaddingBottom /> : null}
          </Container>
        ) : (
          <>
            {metaTagsProps?.topPadding ? <PagePaddingTop /> : null}
            {children}
            {metaTagsProps?.topPadding ? <PagePaddingBottom /> : null}
          </>
        )}
        <Box flexGrow={1} />
        <Box display={{ xs: 'none', sm: 'block' }}>
          <Footer {...metaTagsProps} />
        </Box>
        <ThemeOverride />
      </body>
    </>
  );
};

export default DefaultLayout;

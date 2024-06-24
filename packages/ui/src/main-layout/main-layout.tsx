'use-client';

import Head from 'next/head';
import { ReactNode, useEffect } from 'react';
import { Breakpoint, createTheme, ThemeProvider } from '@mui/material/styles';
import { blue, indigo, grey } from '@mui/material/colors';
import { Languages } from '@repo/utils';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import NavBar from '../nav-bar';
import Footer from '../footer';
import type { SignInMenuUser } from '../nav-bar/sign-in-menu';
import { useRouter } from 'next/router';
import { BaseUser } from '@repo/utils';

const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: blue[600],
      contrastText: '#fff',
      dark: blue[700],
      light: '#fff',
    },
    secondary: {
      main: blue[500],
    },
  },
  typography: {
    fontFamily: 'Roboto',
  },
});

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: indigo[800],
      contrastText: '#fff',
      dark: indigo[900],
      light: grey[800],
    },
    secondary: {
      main: grey[900],
    },
  },
  typography: {
    fontFamily: 'Roboto',
  },
});

interface Props {
  children: any;
  darkMode: boolean;
  switchTheme: () => void;
  devMode: boolean;
  switchDevMode: () => void;
  isLoading: boolean;
  language: Languages;
  user?: SignInMenuUser;
  loginEnabled: boolean;
  version: string;
  hostName: string;
  logo: string;
  menu?: ReactNode;
  maxWidth?: Breakpoint | false;
}

const MainLayout = ({
  children,
  darkMode = false,
  switchTheme,
  devMode = false,
  switchDevMode,
  isLoading = false,
  language = 'en',
  user,
  loginEnabled = false,
  version,
  hostName,
  logo = '/images/logo.jpg',
  menu,
  maxWidth = 'lg',
}: Props) => {
  const router = useRouter();
  const setIsLoading = () => null;

  useEffect(() => {
    const user = new BaseUser();
    user.refreshToken().catch((e: any) => {
      if (e && e.length && e[0].code === 'token_not_valid') {
        router.reload();
      }
    });
  }, []);

  return (
    <ThemeProvider theme={darkMode ? darkTheme : lightTheme}>
      <Box
        sx={{
          backgroundColor: 'primary.light',
        }}
        className="page"
      >
        <Head>
          <link rel="icon" href="/favicon.ico" />
          <meta
            name="description"
            content="Learn how to build a personal website using Next.js"
          />
          <meta name="og:title" content={'siteTitle'} />
          <meta name="twitter:card" content="summary_large_image" />
        </Head>
        <header>
          <NavBar
            logo={logo}
            user={user}
            language={language}
            devMode={devMode}
            darkMode={darkMode}
            loginButton={loginEnabled}
            logoWidth="60px"
            isLoading={isLoading}
            setIsLoading={setIsLoading}
          >
            {menu}
          </NavBar>
        </header>
        <Box>
          {isLoading ? (
            <Box
              position="fixed"
              zIndex={1}
              width="100%"
              height="100%"
              top={0}
              left={0}
              display="flex"
              justifyContent="center"
              alignItems="center"
            >
              <CircularProgress size={60} />
            </Box>
          ) : (
            <>
              {maxWidth ? (
                <Container
                  maxWidth={maxWidth}
                  sx={{
                    opacity: isLoading ? '0.5' : 1,
                  }}
                >
                  <Box
                    height={{
                      xs: 55,
                      sm: 60,
                    }}
                    className="hide-on-print"
                  ></Box>
                  {children}
                </Container>
              ) : (
                <>
                  <Box
                    height={{
                      xs: 55,
                      sm: 60,
                    }}
                    className="hide-on-print"
                  ></Box>
                  {children}
                </>
              )}
            </>
          )}
        </Box>
        <Footer
          version={version}
          darkMode={darkMode}
          devMode={devMode}
          switchTheme={switchTheme}
          switchDevMode={switchDevMode}
          hostName={hostName}
        />
      </Box>
    </ThemeProvider>
  );
};

export default MainLayout;

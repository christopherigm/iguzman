'use-client';

import Head from 'next/head';
import { ReactNode } from 'react';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { blue, indigo, grey } from '@mui/material/colors';
import { Languages } from '@repo/utils';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import NavBar from '../nav-bar';
import Footer from '../footer';
import type { SignInMenuUser } from '../nav-bar/sign-in-menu';

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
}: Props) => {
  const setIsLoading = () => null;

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
            <Container
              maxWidth="lg"
              sx={{
                paddingTop: '60px',
                opacity: isLoading ? '0.5' : 1,
              }}
            >
              {children}
            </Container>
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

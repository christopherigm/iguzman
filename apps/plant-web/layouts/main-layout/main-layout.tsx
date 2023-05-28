import Head from 'next/head';
import {ReactNode} from 'react';
import {
  NavBar,
  Footer
} from 'ui';
import type System from 'interfaces/system-interface';
import type {setSystem} from 'interfaces/system-interface';
import {
  createTheme,
  ThemeProvider
} from '@mui/material/styles';
import {
  blue,
  indigo,
  purple,
  grey
} from '@mui/material/colors';
import {SaveCookie} from 'utils';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';


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
      main: blue[500]
    }
  },
  typography: {
    fontFamily: 'Roboto'
  }
});

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: indigo[800],
      contrastText: '#fff',
      dark: indigo[900],
      light: grey[800]
    },
    secondary: {
      main: grey[900]
    }
  },
  typography: {
    fontFamily: 'Roboto'
  }
});

interface Props {
  children: ReactNode;
  system: System;
  setSystem: setSystem;
  menus?: ReactNode;
};

const MainLayout = ({ children, system, setSystem, menus }: Props) => {
  const switchTheme = () => {
    SaveCookie('darkMode', String(!system.darkMode));
    setSystem({
      ...system,
      darkMode: !system.darkMode
    });
  };

  const switchDevMode = () => {
    SaveCookie('devMode', String(!system.devMode));
    setSystem({
      ...system,
      devMode: !system.devMode
    });
  };

  return (
    <ThemeProvider theme={system.darkMode ? darkTheme : lightTheme}>
      <Box 
        sx={{
          backgroundColor: 'primary.light'
        }}
        className='page'>
        <Head>
          <link rel='icon' href='/favicon.ico' />
          <meta
            name='description'
            content='Learn how to build a personal website using Next.js'
          />
          <title>Title</title>
          <meta name='og:title' content={'siteTitle'} />
          <meta name='twitter:card' content='summary_large_image' />
        </Head>
        <header>
          <NavBar
            logo='/images/logo.png'
            user={system.user}
            language={system.language}
            devMode={system.devMode}
            loginButton={system.loginEnabled}
            logoWidth='60px'>
            {menus}
          </NavBar>
        </header>
        <Container maxWidth='lg'>
          {children}
        </Container>
        <Footer
          darkMode={system.darkMode}
          devMode={system.devMode}
          switchTheme={switchTheme}
          switchDevMode={switchDevMode} />
      </Box>
    </ThemeProvider>
  );
};

export default MainLayout;

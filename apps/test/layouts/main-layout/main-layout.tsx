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
  grey
} from '@mui/material/colors';
import {SaveCookie} from 'utils';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';

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
  menu?: ReactNode;
};

const MainLayout = ({
    children,
    system,
    setSystem,
    menu,
  }: Props) => {
  const switchTheme = () => {
    SaveCookie('darkMode', String(!system.darkMode), system.paths);
    setSystem({
      ...system,
      darkMode: !system.darkMode
    });
  };

  const switchDevMode = () => {
    SaveCookie('devMode', String(!system.devMode), system.paths);
    setSystem({
      ...system,
      devMode: !system.devMode
    });
  };

  const setIsLoading = () => setSystem({
    ...system,
    isLoading: true
  });

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
          <meta name='og:title' content={'siteTitle'} />
          <meta name='twitter:card' content='summary_large_image' />
        </Head>
        <header>
          <NavBar
            logo='/images/logo.jpg'
            user={system.user}
            language={system.language}
            devMode={system.devMode}
            darkMode={system.darkMode}
            loginButton={system.loginEnabled}
            logoWidth='60px'
            isLoading={system.isLoading}
            setIsLoading={setIsLoading}>
            {menu}
          </NavBar>
        </header>
        <Box>
          {
            system.isLoading ?
              <Box
                position='fixed'
                zIndex={1}
                width='100%'
                height='100%'
                top={0}
                left={0}
                display='flex'
                justifyContent='center'
                alignItems='center'>
                <CircularProgress size={60}/>
              </Box> :
              <Container
                maxWidth='lg'
                sx={{
                  paddingTop: '60px',
                  opacity: system.isLoading ? '0.5' : 1
                }}>
                {children}
              </Container>
          }
        </Box>
        <Footer
          version={system.version}
          darkMode={system.darkMode}
          devMode={system.devMode}
          switchTheme={switchTheme}
          switchDevMode={switchDevMode}
          hostName={system.hostName} />
      </Box>
    </ThemeProvider>
  );
};

export default MainLayout;

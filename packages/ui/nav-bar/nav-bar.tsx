import {useEffect, useState} from 'react';
import Link from 'next/link';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import MenuIcon from '@mui/icons-material/Menu';
import List from '@mui/material/List';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import Logo from 'ui/logo';
import Container from '@mui/material/Container';
import SignInMenu from './sign-in-menu';
import type {Languages} from 'utils';
import { useRouter } from 'next/router';

interface Props {
  children?: any;
  logo: string;
  user?: any;
  language: Languages;
  devMode: boolean;
  darkMode: boolean;
  loginButton?: boolean;
  logoWidth?: string;
  isLoading: boolean;
  setIsLoading: () => void;
};

const NavBar = ({
    children,
    logo,
    user,
    language,
    devMode = false,
    darkMode = false,
    loginButton = false,
    logoWidth = '200px',
    isLoading,
    setIsLoading,
  }: Props) => {
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);
  const drawerWidth = 240;
  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };
  const router = useRouter();
  const [enableLogoButton, setEnableLogoButton] = useState<boolean>(false);

  useEffect(() => {
    if (router.pathname !== '/') {
      setEnableLogoButton(_p => true);
    }
  }, []);

  return (
    <>
    <AppBar
      color='inherit'
      position='fixed'
      component='nav'
      className='NavBar'>
      <Container maxWidth='lg'>
        <Toolbar disableGutters>
          <IconButton
            color={darkMode ? 'success' : 'primary'}
            aria-label='open drawer'
            edge='start'
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}>
            <MenuIcon />
          </IconButton>
          {
            enableLogoButton ?
              <Link
                href='/'
                onClick={setIsLoading}>
                <Logo logo={logo} devMode={devMode} width={logoWidth} />
              </Link> :
              <Logo logo={logo} devMode={devMode} width={logoWidth} />
          }
          <Typography sx={{ flexGrow: 1 }}></Typography>
          <Box sx={{
            display: {
              xs: 'none',
              sm: 'block',
            }
          }}>
          {
            !isLoading ? <>{children}</> : null
          }
          </Box>
          {
            loginButton ?
              <SignInMenu
                user={user}
                language={language}
                darkMode={darkMode} /> :
              null
          }
        </Toolbar>
      </Container>
    </AppBar>
    <Drawer
      variant='temporary'
      open={mobileOpen}
      onClose={handleDrawerToggle}
      ModalProps={{
        keepMounted: true,
      }}
      sx={{
        display: { xs: 'block', sm: 'none' },
        '& .MuiDrawer-paper': {
          boxSizing: 'border-box',
          width: drawerWidth
        },
      }}
    >
      <Box
        onClick={handleDrawerToggle}
        sx={{ textAlign: 'center' }}>
        <Logo logo={logo} fullWidth={true} />
        <Divider />
        <List>
          {children}
        </List>
      </Box>
    </Drawer>
    </>
  );
}

export default NavBar;
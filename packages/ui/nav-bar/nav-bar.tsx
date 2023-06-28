import {useState} from 'react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import MenuIcon from '@mui/icons-material/Menu';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Link from 'next/link';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import Logo from 'ui/logo';
import Container from '@mui/material/Container';
import SignInMenu from './sign-in-menu';
import type {Languages} from 'utils';

interface Props {
  children?: any;
  logo: string;
  user?: any;
  language: Languages;
  devMode: boolean;
  loginButton?: boolean
  logoWidth?: string
};

const NavBar = ({
    children,
    logo,
    user,
    language,
    devMode,
    loginButton = false,
    logoWidth = '200px'
  }: Props) => {
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);
  const drawerWidth = 240;
  // const navItems = ['Home', 'About', 'Contact'];

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

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
            color='primary'
            aria-label='open drawer'
            edge='start'
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}>
            <MenuIcon />
          </IconButton>
          <Link href='/'>
            <Logo logo={logo} devMode={devMode} width={logoWidth} />
          </Link>
          <Typography sx={{ flexGrow: 1 }}></Typography>
          <Box sx={{
            display: {
              xs: 'none',
              sm: 'block',
            }
          }}>
            {children}
          </Box>
          {
            loginButton ?
              <SignInMenu user={user} language={language} /> :
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
          {/* {navItems.map((item) => (
            <ListItem key={item} disablePadding>
              <ListItemButton sx={{ textAlign: 'center' }}>
                <ListItemText primary={item} />
              </ListItemButton>
            </ListItem>
          ))} */}
          {children}
        </List>
      </Box>
    </Drawer>
    </>
  );
}

export default NavBar;
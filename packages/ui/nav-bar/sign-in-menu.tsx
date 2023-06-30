import {useState} from 'react';
import Link from 'next/link';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Menu from '@mui/material/Menu';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import Avatar from '@mui/material/Avatar';
import AccountCircle from '@mui/icons-material/AccountCircle';
import {
  DeleteCookie,
  SetLocalStorageData,
} from 'utils';
import type {Languages} from 'utils';
import { useRouter } from 'next/router';

type User = {
  attributes: {
    username: string;
    img_picture: string;
    firstname: string;
    lastname: string;
  }
}

type Props = {
  language: Languages
  user?: User;
}

const SignInMenu = ({user, language='en'}: Props) => {
  const router = useRouter()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const logOutAndHandleClose = () => {
    setAnchorEl(null);
    DeleteCookie('jwt');
    DeleteCookie('user');
    SetLocalStorageData('jwt', '');
    SetLocalStorageData('user', '');
    router.reload();
  };

  return (
    <div>
      {
        user ?
        <>
          <Tooltip title='Open settings'>
            <IconButton onClick={handleMenu} sx={{ p: 0 }}>
              <Avatar
                alt=''
                src={
                  user.attributes.img_picture ?
                  user.attributes.img_picture :
                  '/images/profile.jpg'
                  } />
            </IconButton>
          </Tooltip>
          <Menu
            id='menu-appbar'
            anchorEl={anchorEl}
            anchorOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
            keepMounted
            transformOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
            open={Boolean(anchorEl)}
            onClose={handleClose}>
            <Link href='/account'>
              <MenuItem onClick={handleClose}>
                <Typography
                  variant='body1'
                  color='primary.dark'>
                  {language === 'en' ? 'My account' : 'Mi cuenta'}
                </Typography>
              </MenuItem>
            </Link>
            <MenuItem onClick={logOutAndHandleClose}>
              <Typography
                variant='body1'
                color='primary.dark'>
                {language === 'en' ? 'Logout' : 'Cerrar sesion'}
              </Typography>
            </MenuItem>
          </Menu>
        </> :
        <>
          <IconButton
            size='large'
            aria-label='account of current user'
            aria-controls='menu-appbar'
            aria-haspopup='true'
            onClick={handleMenu}
            color='primary'>
            <AccountCircle />
          </IconButton>
          <Menu
            id='menu-appbar'
            anchorEl={anchorEl}
            anchorOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
            keepMounted
            transformOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
            open={Boolean(anchorEl)}
            onClose={handleClose}>
              <Link href='/sign-in'>
                <MenuItem onClick={handleClose}>
                  <Typography
                    variant='body1'
                    color='primary.dark'>
                    {language === 'en' ? 'Login' : 'Iniciar sesion'}
                  </Typography>
                </MenuItem>
              </Link>
              <Link href='/sign-up'>
                <MenuItem onClick={handleClose}>
                  <Typography
                    variant='body1'
                    color='primary.dark'>
                    {language === 'en' ? 'Sign up' : 'Crear cuenta'}
                  </Typography>
                </MenuItem>
              </Link>
          </Menu>
        </>
      }
      
    </div>
  );
}

export default SignInMenu;

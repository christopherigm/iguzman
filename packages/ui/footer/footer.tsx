import {ReactElement, useState} from 'react';
import FormControlLabel from '@mui/material/FormControlLabel';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import Link from 'next/link';
import GitHubIcon from '@mui/icons-material/GitHub';

export type changeBooleanValue = () => void;

type Props = {
  version?: string;
  darkMode: boolean;
  switchTheme: changeBooleanValue;
  devMode: boolean;
  switchDevMode: changeBooleanValue;
  hostName: string;
};

const Footer = ({
    version,
    darkMode,
    switchTheme,
    devMode,
    switchDevMode,
    hostName
  }: Props): ReactElement => {
  const [devModeTimes, setDevModeTimes] = useState<number>(0);
  
  const enableDevMode = () => {
    if (!devMode && devModeTimes > 1) {
      switchDevMode();
      setDevModeTimes(_p => 0);
    } else if (devMode) {
      switchDevMode();
    } else {
      setDevModeTimes(v => v + 1);
    }
  };

  return(
    <>
      <div className='Footer__flex-filler'></div>
      <Box 
        sx={{
          height: 'auto',
          backgroundColor: 'secondary.main'
        }}>
        <Container maxWidth='lg'>
          <footer>
            <Typography
              variant='body2'
              color='primary.contrastText'
              className={devMode ?
                'Footer__version PreventSelect DevMode' :
                'Footer__version PreventSelect'
              }
              onClick={enableDevMode}>
              Ver. {version ? version : '0.0.1'} {devMode ? `- Host: ${hostName}` : null}
            </Typography>
            <Typography sx={{ flexGrow: 1 }}></Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={darkMode}
                  onChange={switchTheme}
                  className={devMode ? 'DevMode' : ''} />
              }
              label={darkMode ? '🔅' : '🌙'}
              className={devMode ? 'DevMode' : ''} />
            <Link
              target='_blank'
              href='https://github.com/christopherigm'>
              <IconButton
                aria-label="add to shopping cart"
                className={devMode ? 'DevMode' : ''}>
                <GitHubIcon />
              </IconButton>
            </Link>
          </footer>
        </Container>
      </Box>
    </>
  );
};

export default Footer;

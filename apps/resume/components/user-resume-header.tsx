import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import Pagination from '@mui/material/Pagination';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import IconButton from '@mui/material/IconButton';
import DeleteIcon from '@mui/icons-material/Delete';
import AudioIcon from '@mui/icons-material/Audiotrack';
import YouTube from '@mui/icons-material/YouTube';
import Instagram from '@mui/icons-material/Instagram';
import Facebook from '@mui/icons-material/Facebook';
import X from '@mui/icons-material/X';
import BlockIcon from '@mui/icons-material/Block';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import GridViewIcon from '@mui/icons-material/GridView';
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import SplitscreenIcon from '@mui/icons-material/Splitscreen';
import ErrorIcon from '@mui/icons-material/Error';
import LinearProgress from '@mui/material/LinearProgress';
import { Signal, signal } from '@preact-signals/safe-react';
import { PaperCard } from '@repo/ui';
import { InnerSort, DateParser, HourParser } from '@repo/utils';
// import Item, { VideoType } from 'classes/item';
import { ReactElement, ReactNode, useEffect } from 'react';
import LinkedIn from '@mui/icons-material/LinkedIn';
import GitHub from '@mui/icons-material/GitHub';
import Email from '@mui/icons-material/Email';
import Phone from '@mui/icons-material/Phone';
import ReactPlayer from 'react-player';
import copy from 'copy-to-clipboard';
import Link from 'next/link';
import User from 'classes/user';
import ResumesGridItem from 'components/resumes-grid-item';
import Avatar from '@mui/material/Avatar';
import Ribbon from 'components/ribbon';
import Badge from 'components/badge';
import Container from '@mui/material/Container';
import { useMediaQuery, useTheme } from '@mui/material';

type Props = {
  user: User;
  devMode: boolean;
  darkMode: boolean;
};

const UserResumeHeader = ({ user, devMode, darkMode }: Props): ReactElement => {
  const theme = useTheme();
  const isXSSize: boolean = useMediaQuery(theme.breakpoints.only('xs'));

  return (
    <Box
      sx={{
        backgroundImage: `url('${user.attributes.img_hero_picture}')`,
        backgroundPosition: 'center',
        backgroundSize: 'cover',
      }}
    >
      <Box
        sx={{
          background:
            'linear-gradient(0deg, rgba(0,0,0,0.6) 10%, rgba(0,0,0,0) 50%)',
        }}
      >
        <Container maxWidth="lg" sx={{ padding: 0 }}>
          <Box
            display="flex"
            flexDirection="column"
            justifyContent="start"
            alignItems="end"
            height={{
              xs: 140,
              sm: 200,
            }}
          >
            {user.attributes.open_to_work ? (
              <Ribbon
                text="Open to work"
                color="#4caf50"
                borderColor="#357a38"
                marginTop={2}
              />
            ) : null}
            {user.attributes.listening_offers ? (
              <Ribbon
                text="Listening to offers"
                color="#2196f3"
                borderColor="#1769aa"
              />
            ) : null}
            {user.attributes.willing_to_comute ? (
              <Ribbon
                text="Willing to comute"
                color="#673ab7"
                borderColor="#482880"
              />
            ) : null}
          </Box>
          <Box
            display="flex"
            flexDirection="row"
            justifyContent="space-between"
            paddingBottom={1.5}
            paddingLeft={{
              xs: 1.5,
              sm: 0,
            }}
            paddingRight={{
              xs: 1.5,
              sm: 0,
            }}
          >
            <Box display="flex" flexDirection="row" alignItems="end">
              <Avatar
                alt={`${user.attributes.first_name} ${user.attributes.last_name}`}
                src={user.attributes.img_picture}
                sx={{
                  width: {
                    xs: 90,
                    sm: 180,
                  },
                  height: {
                    xs: 90,
                    sm: 180,
                  },
                  textShadow: '1px 1px 3px rgba(0,0,0,1)',
                }}
              />
              <Box
                display="flex"
                flexDirection="column"
                alignItems="start"
                marginLeft={2}
                paddingBottom={{
                  xs: 0,
                  sm: 1,
                  md: 1.5,
                }}
              >
                <Typography
                  variant={isXSSize ? 'h6' : 'h4'}
                  color="primary.contrastText"
                  noWrap={false}
                  sx={{
                    textShadow: '1px 1px 3px rgba(0,0,0,1)',
                    marginBottom: {
                      xs: 0.8,
                      sm: 0.5,
                    },
                  }}
                  lineHeight={1.1}
                >
                  {user.attributes.first_name}
                  {user.attributes.last_name
                    ? ` ${user.attributes.last_name.split(' ')[0]}`
                    : null}
                </Typography>
                {user.attributes.headline ? (
                  <Typography
                    variant={isXSSize ? 'body2' : 'h6'}
                    color="primary.contrastText"
                    fontStyle="italic"
                    textAlign="center"
                    noWrap={false}
                    sx={{
                      textShadow: '1px 1px 3px rgba(0,0,0,1)',
                    }}
                  >
                    {user.attributes.headline}
                  </Typography>
                ) : null}
                <Typography
                  variant="body1"
                  color="primary.contrastText"
                  sx={{
                    textShadow: '1px 1px 3px rgba(0,0,0,1)',
                  }}
                >
                  {user.attributes.years_of_experience} years of experience
                </Typography>
              </Box>
            </Box>
            {/* <Box display="flex" flexDirection="column" justifyContent="end">
              <Box display="flex" flexDirection="row" justifyContent="end">
                {user.attributes.linkedin ? (
                  <Badge>
                    <LinkedIn fontSize="small" />
                  </Badge>
                ) : null}
                {user.attributes.github ? (
                  <Badge>
                    <GitHub fontSize="small" />
                  </Badge>
                ) : null}
                {user.attributes.email ? (
                  <Badge>
                    <Email fontSize="small" />
                  </Badge>
                ) : null}
                {user.attributes.phone_number ? (
                  <Badge>
                    <Phone fontSize="small" />
                  </Badge>
                ) : null}
              </Box>
            </Box> */}
          </Box>
        </Container>
      </Box>
      {/* <Typography
        marginTop={3}
        variant="h5"
        color={darkMode ? 'primary.contrastText' : ''}
      >
        {user.attributes.first_name}
        {user.attributes.last_name ? ` ${user.attributes.last_name}` : null}
      </Typography>
      <Box marginTop={1.5}>
        <Divider />
      </Box> */}
    </Box>
  );
};

export default UserResumeHeader;

import React, { ReactElement, ReactNode, useEffect } from 'react';
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
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import LinearProgress from '@mui/material/LinearProgress';
import { Signal, signal } from '@preact-signals/safe-react';
import { PaperCard } from '@repo/ui';
import { InnerSort, DateParser, HourParser } from '@repo/utils';
// import Item, { VideoType } from 'classes/item';
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
import { useMediaQuery, useTheme } from '@mui/material';

type UserInfoItemProps = {
  children: ReactNode;
  title: string;
  subTitle?: string;
};

const UserInfoItem = ({
  children,
  title,
  subTitle,
}: UserInfoItemProps): ReactNode => {
  return (
    <Box
      display="flex"
      flexDirection="row"
      justifyContent="space-between"
      marginBottom={3}
    >
      <Box
        display="flex"
        justifyContent="center"
        width={50}
        color="white"
        paddingTop={0.2}
      >
        {children}
      </Box>
      <Box
        display="flex"
        flexDirection="column"
        justifyContent="start"
        width="calc(100% - 60px)"
        paddingBottom={1.5}
        borderBottom="1px solid rgba(0,0,0,0.2)"
      >
        <Typography
          variant="body1"
          color="primary.contrastText"
          sx={{
            wordBreak: 'break-all',
          }}
        >
          {title}
        </Typography>
        {subTitle ? (
          <Typography variant="body2" color="primary.contrastText">
            {subTitle}
          </Typography>
        ) : null}
      </Box>
    </Box>
  );
};

type Props = {
  user: User;
  devMode: boolean;
  darkMode: boolean;
};

const UserInfo = ({ user, devMode, darkMode }: Props): ReactElement => {
  const theme = useTheme();
  const isXSSize: boolean = useMediaQuery(theme.breakpoints.only('xs'));
  const iconSize = 'medium';

  return (
    <PaperCard padding={0} elevation={2} marginTop={0}>
      <Box
        paddingTop={2}
        paddingLeft={2}
        paddingRight={2}
        paddingBottom={0.1}
        bgcolor={user.attributes.theme_color}
      >
        <UserInfoItem
          title={`${user.attributes.first_name} ${user.attributes.last_name}`}
          subTitle={DateParser(user.attributes.birthday.toString() ?? '')}
        >
          <AccountCircleIcon fontSize={iconSize} />
        </UserInfoItem>
        {user.attributes.phone_number ? (
          <UserInfoItem title={user.attributes.phone_number}>
            <Phone fontSize={iconSize} />
          </UserInfoItem>
        ) : null}
        {user.attributes.email ? (
          <UserInfoItem title={user.attributes.email}>
            <Email fontSize={iconSize} />
          </UserInfoItem>
        ) : null}
        {user.attributes.linkedin ? (
          <UserInfoItem title={user.attributes.linkedin}>
            <LinkedIn fontSize={iconSize} />
          </UserInfoItem>
        ) : null}
        {user.attributes.github ? (
          <UserInfoItem title={user.attributes.github}>
            <GitHub fontSize={iconSize} />
          </UserInfoItem>
        ) : null}
      </Box>
    </PaperCard>
  );
};

export default UserInfo;

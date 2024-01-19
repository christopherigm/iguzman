import React, { ReactElement } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import User from 'classes/user';
import Avatar from '@mui/material/Avatar';
import Ribbon from 'components/ribbon';
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
                    variant={isXSSize ? 'body1' : 'h6'}
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
          </Box>
        </Container>
      </Box>
    </Box>
  );
};

export default UserResumeHeader;

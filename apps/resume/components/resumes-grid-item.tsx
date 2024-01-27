import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LinkedIn from '@mui/icons-material/LinkedIn';
import GitHub from '@mui/icons-material/GitHub';
import Email from '@mui/icons-material/Email';
import Phone from '@mui/icons-material/Phone';
import { PaperCard } from '@repo/ui';
import { ReactElement } from 'react';
import User from 'classes/user';
import Avatar from '@mui/material/Avatar';
import Link from 'next/link';
import Ribbon from 'components/ribbon';
import Badge from 'components/badge';

type Props = {
  user: User;
  devMode: boolean;
  darkMode: boolean;
};

const ResumesGridItem = ({ user, devMode, darkMode }: Props): ReactElement => {
  return (
    <PaperCard padding={0}>
      <Link href={`/${user.attributes.username}`} passHref={false}>
        <Box display="flex" flexDirection="column">
          <Box
            borderRadius={1}
            sx={{
              backgroundImage: `url('${user.attributes.img_hero_picture}')`,
              backgroundPosition: 'center bottom',
              backgroundSize: 'cover',
            }}
          >
            <Box
              sx={{
                background:
                  'linear-gradient(0deg, rgba(0,0,0,0.6) 10%, rgba(0,0,0,0) 50%)',
              }}
            >
              <Box
                display="flex"
                flexDirection="column"
                justifyContent="start"
                alignItems="end"
                height={120}
              >
                {user.attributes.open_to_work ? (
                  <Ribbon
                    text="Open to work"
                    color="#4caf50"
                    borderColor="#357a38"
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
                paddingLeft={1.5}
                paddingRight={1.5}
              >
                <Avatar
                  alt={`${user.attributes.first_name} ${user.attributes.last_name}`}
                  src={user.attributes.img_picture}
                  sx={{ width: 90, height: 90 }}
                />
                <Box
                  display="flex"
                  flexDirection="column"
                  justifyContent="end"
                  alignItems="end"
                >
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
                  <Typography
                    variant="body2"
                    color="primary.contrastText"
                    marginTop={1}
                    sx={{
                      textShadow: '1px 1px 3px rgba(0,0,0,1)',
                    }}
                  >
                    {user.attributes.years_of_experience} years of experience
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>
          <Box marginTop={1}>
            <Typography
              variant="h5"
              textAlign="center"
              noWrap={true}
              color={darkMode ? 'white' : '#333'}
            >
              {user.attributes.first_name} {user.attributes.last_name}
            </Typography>
          </Box>
          {user.attributes.headline ? (
            <Box marginTop={0.5} marginBottom={2}>
              <Typography
                variant="body2"
                fontStyle="italic"
                textAlign="center"
                noWrap={true}
                color={darkMode ? 'white' : '#333'}
              >
                {user.attributes.headline}
              </Typography>
            </Box>
          ) : null}
        </Box>
      </Link>
    </PaperCard>
  );
};

export default ResumesGridItem;

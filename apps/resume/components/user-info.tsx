import React, { ReactElement, ReactNode, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import PlaceIcon from '@mui/icons-material/Place';
import LaunchIcon from '@mui/icons-material/Launch';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { Signal, signal } from '@preact-signals/safe-react';
import { PaperCard } from '@repo/ui';
import LinkedIn from '@mui/icons-material/LinkedIn';
import GitHub from '@mui/icons-material/GitHub';
import Email from '@mui/icons-material/Email';
import Phone from '@mui/icons-material/Phone';
import copy from 'copy-to-clipboard';
import Link from 'next/link';
import User from 'classes/user';
import Snackbar from '@mui/material/Snackbar';
import { IconButton, useMediaQuery, useTheme } from '@mui/material';

type UserInfoItemProps = {
  children: ReactNode;
  title: string;
  subTitle?: string;
  href?: string;
  countryCode?: string;
};

const UserInfoItem = ({
  children,
  title,
  subTitle,
  href,
  countryCode,
}: UserInfoItemProps): ReactNode => {
  const Title = (): ReactNode => {
    return (
      <Typography
        variant="body1"
        color="primary.contrastText"
        sx={{
          wordBreak: 'break-all',
        }}
      >
        {title}
        {countryCode ? (
          <span
            className={`fi fi-${countryCode}`}
            style={{ fontSize: 'small', marginLeft: 5, paddingTop: 3 }}
          ></span>
        ) : null}
      </Typography>
    );
  };

  return (
    <Box
      display="flex"
      flexDirection="row"
      justifyContent="space-between"
      marginBottom={3}
    >
      <Box display="flex" justifyContent="center" width={26} paddingTop={0.2}>
        {children}
      </Box>
      <Box
        display="flex"
        flexDirection="column"
        justifyContent="start"
        width="calc(100% - 40px)"
        paddingBottom={1.5}
        borderBottom="1px solid rgba(0,0,0,0.2)"
      >
        {href ? (
          <Link href={href} target="_blank">
            <Title />
          </Link>
        ) : (
          <Title />
        )}
        {subTitle ? (
          <Typography variant="body2" color="primary.contrastText">
            {subTitle}
          </Typography>
        ) : null}
      </Box>
    </Box>
  );
};

type UserInfoMiniItemProps = {
  children: ReactNode;
  bgcolor: string;
  onClick: () => void;
};

const UserInfoMiniItem = ({
  children,
  bgcolor,
  onClick,
}: UserInfoMiniItemProps): ReactNode => {
  return (
    <PaperCard
      padding={0}
      elevation={2}
      width="calc(25% - 10px)"
      marginTop={0}
      marginBottom={2}
    >
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        padding={1}
        sx={{ cursor: 'pointer', userSelect: 'none' }}
        bgcolor={bgcolor}
        onClick={() => onClick()}
      >
        <Box display="flex" justifyContent="center" width={50} paddingTop={0.2}>
          {children}
        </Box>
      </Box>
    </PaperCard>
  );
};

type Props = {
  user: User;
  devMode: boolean;
  darkMode: boolean;
};

type Item = {
  id: number;
  title: string;
  icon: ReactNode;
  href?: string;
  subtitle?: string;
  countryCode?: string;
};

const items: Signal<Array<Item>> = signal([]);
const itemSelected: Signal<number | null> = signal(null);

const UserInfo = ({ user, devMode, darkMode }: Props): ReactElement => {
  const theme = useTheme();
  const isXSSize: boolean = useMediaQuery(theme.breakpoints.only('xs'));
  const iconSize = 'medium';
  const countryCode: string | null =
    user.relationships?.city?.data?.relationships?.state?.data?.relationships
      ?.country?.data?.attributes?.code ?? null;
  const state: string | null =
    user.relationships?.city?.data?.relationships?.state?.data?.attributes
      ?.code ?? null;
  const city: string | null =
    user.relationships?.city?.data?.attributes?.name ?? null;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!items.value.length) {
      items.value.push({
        id: 0,
        title: `${user.attributes.first_name} ${user.attributes.last_name}`,
        icon: <AccountCircleIcon fontSize={iconSize} htmlColor="white" />,
      });
      if (user.attributes.phone_number) {
        items.value.push({
          id: 1,
          title: user.attributes.phone_number,
          href: `tel:${user.attributes.phone_number}`,
          icon: <Phone fontSize={iconSize} htmlColor="white" />,
        });
      }
      if (user.attributes.email) {
        items.value.push({
          id: 1,
          title: user.attributes.email,
          href: `mailto:${user.attributes.email}`,
          icon: <Email fontSize={iconSize} htmlColor="white" />,
        });
      }
      if (user.attributes.linkedin) {
        items.value.push({
          id: 2,
          title: user.attributes.linkedin,
          href: user.attributes.linkedin,
          icon: <LinkedIn fontSize={iconSize} htmlColor="white" />,
        });
      }
      if (user.attributes.github) {
        items.value.push({
          id: 3,
          title: user.attributes.github,
          href: user.attributes.github,
          icon: <GitHub fontSize={iconSize} htmlColor="white" />,
        });
      }
      if (city && state) {
        items.value.push({
          id: 4,
          title: `${city}, ${state}`,
          href: `https://maps.google.com/?q=${city}, ${state}, ${countryCode}`,
          icon: <PlaceIcon fontSize={iconSize} htmlColor="white" />,
          countryCode: countryCode ? countryCode.toLowerCase() : countryCode,
        });
      }
    }
  }, []);

  return (
    <>
      {isXSSize ? (
        <Box
          display="flex"
          justifyContent="space-between"
          flexWrap="wrap"
          flexBasis={1}
        >
          {items.value.map((i: Item, index: number) => (
            <UserInfoMiniItem
              bgcolor={user.attributes.theme_color}
              onClick={() =>
                itemSelected.value === i.id
                  ? (itemSelected.value = null)
                  : (itemSelected.value = i.id)
              }
              key={index}
            >
              {i.icon}
            </UserInfoMiniItem>
          ))}
          {items.value.map((i: Item, index: number) => {
            if (itemSelected.value !== null && i.id === itemSelected.value) {
              return (
                <PaperCard padding={0} elevation={2} marginTop={0} key={index}>
                  <Box
                    bgcolor={user.attributes.theme_color}
                    padding={1}
                    display="flex"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Box display="flex" alignItems="center">
                      <Box marginRight={1} paddingTop={0.5}>
                        {i.icon}
                      </Box>
                      <Typography
                        variant="body1"
                        color="primary.contrastText"
                        sx={{
                          wordBreak: 'break-all',
                        }}
                      >
                        {i.title}
                      </Typography>
                    </Box>
                    {i.href ? (
                      <Box display="flex" flexDirection="row" marginLeft={1}>
                        <Box
                          onClick={() => {
                            copy(i.title);
                            setOpen(true);
                          }}
                        >
                          <IconButton>
                            <ContentCopyIcon
                              fontSize={iconSize}
                              htmlColor="white"
                            />
                          </IconButton>
                        </Box>
                        <Link href={i.href} target="_blank">
                          <IconButton>
                            <LaunchIcon fontSize={iconSize} htmlColor="white" />
                          </IconButton>
                        </Link>
                      </Box>
                    ) : (
                      <Box flexGrow={1}></Box>
                    )}
                  </Box>
                </PaperCard>
              );
            }
            return null;
          })}
        </Box>
      ) : (
        <PaperCard padding={0} elevation={2} marginTop={0}>
          <Box
            paddingTop={2}
            paddingLeft={2}
            paddingRight={2}
            paddingBottom={0.1}
            bgcolor={user.attributes.theme_color}
          >
            {items.value.map((i: Item, index: number) => (
              <UserInfoItem
                title={i.title}
                subTitle={i.subtitle}
                href={i.href}
                key={index}
              >
                {i.icon}
              </UserInfoItem>
            ))}
          </Box>
        </PaperCard>
      )}

      <Snackbar
        open={open}
        onClose={() => setOpen(false)}
        autoHideDuration={1500}
        message="Copied"
      />
    </>
  );
};

export default UserInfo;

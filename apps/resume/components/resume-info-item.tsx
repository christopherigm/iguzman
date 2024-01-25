import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { PaperCard } from '@repo/ui';
import { ReactElement } from 'react';
import Link from 'next/link';
import { useMediaQuery, useTheme } from '@mui/material';
import LogoItem from 'components/logo-item';

type UserJobItemProps = {
  title: string;
  subTitle?: string;
  image?: string;
  dates?: string;
  description?: string;
  link?: string;
  countryCode?: string;
  darkMode: boolean;
};

const ResumeInfoItem = ({
  title,
  subTitle,
  image,
  dates,
  description,
  link,
  countryCode,
  darkMode,
}: UserJobItemProps): ReactElement => {
  const theme = useTheme();
  const isXSSize: boolean = useMediaQuery(theme.breakpoints.only('xs'));
  const logoSize = isXSSize ? 110 : 90;

  return (
    <PaperCard
      padding={2}
      elevation={2}
      marginTop={isXSSize ? 8 : 0}
      overflow={isXSSize ? 'visible' : 'hidden'}
    >
      <Box
        display="flex"
        flexDirection={isXSSize ? 'column' : 'row'}
        justifyContent="space-between"
        alignItems={isXSSize ? 'center' : 'start'}
      >
        {image ? (
          <Box display="flex" flexDirection="column" alignItems="center">
            {link ? (
              <Link href={link} target="_blank">
                <LogoItem
                  image={image}
                  width={logoSize}
                  height={logoSize}
                  darkMode={darkMode}
                />
              </Link>
            ) : (
              <LogoItem
                image={image}
                width={logoSize}
                height={logoSize}
                darkMode={darkMode}
              />
            )}
          </Box>
        ) : null}
        <Box
          display="flex"
          flexDirection="column"
          width={isXSSize ? '100%' : `calc(100% - ${logoSize + 20}px)`}
        >
          <Typography variant="body1" textAlign={isXSSize ? 'center' : 'left'}>
            {title}
            {subTitle ? <b>{` @${subTitle}`}</b> : null}
            {countryCode ? (
              <span
                className={`fi fi-${countryCode}`}
                style={{ fontSize: 'small', marginLeft: 4, paddingTop: 2 }}
              ></span>
            ) : null}
          </Typography>
          <Box marginBottom={1}>
            {dates ? (
              <Typography
                width="100%"
                variant="body1"
                color={darkMode ? 'white' : 'primary'}
                textAlign={isXSSize ? 'center' : 'left'}
              >
                {dates}
              </Typography>
            ) : null}
          </Box>
          {description ? (
            <Typography variant="body1">{description}</Typography>
          ) : null}
          {link ? (
            <Box marginTop={1}>
              <Link href={link} target="_blank">
                <Typography
                  width="100%"
                  variant="body1"
                  color={darkMode ? 'white' : 'primary'}
                  textAlign={isXSSize ? 'center' : 'left'}
                  noWrap={true}
                >
                  {link}
                </Typography>
              </Link>
            </Box>
          ) : null}
        </Box>
      </Box>
    </PaperCard>
  );
};

export default ResumeInfoItem;

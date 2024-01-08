import React, { useEffect, FormEvent, useRef } from 'react';
import Head from 'next/head';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import IconButton from '@mui/material/IconButton';
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { MainLayout } from '@repo/ui';
import System, { system } from 'classes/system';
import Clock from '@/components/clock';
import { Signal, signal } from '@preact-signals/safe-react';

const isLoading: Signal<boolean> = signal(false);
const success: Signal<boolean | null> = signal(null);
const answerHours: Signal<string> = signal<string>('');
const answerMinutes: Signal<string> = signal<string>('');
const hour: Signal<number> = signal<number>(0);
const minute: Signal<number> = signal<number>(0);
const clockMiniSize: Signal<boolean> = signal(false);

const Page = (props: any) => {
  const clockRef = useRef<HTMLElement>(null);
  const hourRef = useRef<HTMLInputElement>(null);
  const minuteRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    system.setServerSideProps(props);
  }, [props]);
  const getRandomArbitrary = (min: number, max: number) => {
    return Math.floor(Math.random() * (max - min) + min);
  };

  const canSubmit = (): boolean => {
    return answerHours.value !== '' && answerMinutes.value !== '';
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (
      Number(answerHours.value) === hour.value &&
      Number(answerMinutes.value) === minute.value
    ) {
      success.value = true;
    } else {
      success.value = false;
    }
  };

  const setTime = () => {
    hour.value = getRandomArbitrary(1, 12);
    minute.value = getRandomArbitrary(0, 11) * 5;
    answerHours.value = '';
    answerMinutes.value = '';
    success.value = null;
  };

  const scrollToClock = () =>
    clockRef && clockRef.current && clockRef.current.scrollIntoView();

  useEffect(() => {
    hour.value = getRandomArbitrary(1, 12);
    minute.value = getRandomArbitrary(0, 11) * 5;
  }, []);

  return (
    <MainLayout
      darkMode={system.darkMode}
      switchTheme={() => system.switchTheme()}
      devMode={system.devMode}
      switchDevMode={() => system.switchDevMode()}
      isLoading={system.isLoading}
      language={props.defaultLanguage}
      // user={{
      //   firstname: user.attributes.first_name,
      //   lastname: user.attributes.last_name,
      //   username: user.attributes.username,
      //   img_picture: user.attributes.img_picture,
      // }}
      loginEnabled={props.loginEnabled}
      version={props.version}
      logo="/images/logo.png"
      hostName={props.hostName}
    >
      <Head>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="Video downloader" />
        <title>Clock!</title>
        <meta name="og:title" content="Video downloader" />
        <meta name="twitter:card" content="/images/logo.png" />
      </Head>
      <Typography
        marginTop={3}
        variant="h5"
        color={system.darkMode ? 'primary.contrastText' : ''}
      >
        Set the time!
      </Typography>
      <Box marginTop={1.5}>
        <Divider />
      </Box>
      <Box
        display="flex"
        justifyContent="center"
        component="form"
        noValidate={false}
        autoComplete="on"
        onSubmit={handleSubmit}
        marginTop={3}
        marginBottom={3}
      >
        <Grid container columnSpacing={1} rowSpacing={2} maxWidth={400}>
          <Grid item xs={12}>
            <Box position="relative">
              <Box position="absolute" top={0} right={0}>
                <IconButton
                  aria-label="re-download"
                  size="medium"
                  onClick={() => setTime()}
                  color="default"
                >
                  <SettingsBackupRestoreIcon fontSize="medium" />
                </IconButton>
              </Box>
            </Box>
            <Box display="flex" alignItems="center" ref={clockRef}>
              <Clock
                darkMode={system.darkMode}
                fixedTime={new Date(`01/01/2024 ${hour.value}:${minute.value}`)}
                size={!clockMiniSize.value || success.value ? 250 : 200}
              />
            </Box>
          </Grid>
          <Grid item xs={12}>
            {success.value !== null ? (
              <Stack sx={{ width: '100%' }} spacing={2}>
                {success.value ? (
                  <Alert severity="success">Correct!</Alert>
                ) : (
                  <Alert severity="error">{'Not quite correct :('}</Alert>
                )}
              </Stack>
            ) : null}
          </Grid>
          {success.value === null || !success.value ? (
            <Grid item xs={12}>
              <Grid container columnSpacing={2}>
                <Grid item xs={6}>
                  <TextField
                    ref={hourRef}
                    label="Hours"
                    variant="outlined"
                    size="small"
                    type="number"
                    autoComplete="none"
                    autoSave="none"
                    value={answerHours.value}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const value = Math.floor(Number(e.target.value));
                      if (value >= 0 && value <= 12) {
                        answerHours.value = value.toString();
                      }
                    }}
                    onFocusCapture={() => {
                      clockMiniSize.value = true;
                      scrollToClock();
                    }}
                    onBlurCapture={() => (clockMiniSize.value = false)}
                    disabled={isLoading.value}
                    style={{ width: '100%' }}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    ref={minuteRef}
                    label="Minutes"
                    variant="outlined"
                    size="small"
                    type="number"
                    autoComplete="none"
                    autoSave="none"
                    value={answerMinutes.value}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const value = Math.floor(Number(e.target.value));
                      if (value >= 0 && value <= 60) {
                        answerMinutes.value = value.toString();
                      }
                    }}
                    onFocusCapture={() => {
                      clockMiniSize.value = true;
                      scrollToClock();
                    }}
                    onBlurCapture={() => (clockMiniSize.value = false)}
                    disabled={isLoading.value}
                    style={{ width: '100%' }}
                  />
                </Grid>
              </Grid>
            </Grid>
          ) : (
            <Grid item xs={12} display="flex" justifyContent="center">
              <Typography
                variant="h2"
                color={system.darkMode ? 'primary.contrastText' : ''}
              >{`${answerHours.value}:${
                Number(answerMinutes.value) < 10 ? '0' : ''
              }${answerMinutes.value}`}</Typography>
            </Grid>
          )}
          <Grid item xs={12} display="flex" justifyContent="end">
            <Box marginLeft={2}>
              <Button
                type="submit"
                variant="contained"
                disabled={!canSubmit()}
                size="small"
              >
                Check
              </Button>
            </Box>
          </Grid>
        </Grid>
      </Box>
    </MainLayout>
  );
};

export async function getServerSideProps({ req }: any) {
  const props = System.getInstance();
  props.parseCookies(req.cookies);
  return { props: props.getServerSideProps() };
}

export default Page;

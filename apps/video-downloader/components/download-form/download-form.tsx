'use-client';

import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import LinearProgress from '@mui/material/LinearProgress';
import { Signal, signal } from '@preact-signals/safe-react';
import { FormEvent, useEffect } from 'react';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import IconButton from '@mui/material/IconButton';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Download from '@mui/icons-material/Download';
import type { APIPostCreationError } from '@repo/utils';
import { BaseUser, isTiktok, isYoutube } from '@repo/utils';
import type { DownloadOptions } from 'classes/item';
import Tooltip from '@mui/material/Tooltip';

const user = signal<BaseUser>(BaseUser.getInstance()).value;
const isLoading: Signal<boolean> = signal(false);
const error: Signal<Array<APIPostCreationError>> = signal([]);
const link = signal<string>('');
const downloadJustAudio: Signal<boolean> = signal(false);
const downloadHDTikTok: Signal<boolean> = signal(false);

const h264VideoInfo =
  'h264 video feature enable, makes videos more compatible to share. If enabled, download will take longer to complete.';

type Props = {
  URLBase: string;
  callback: (url: string, options: DownloadOptions) => void;
};

const DownloadForm = ({ URLBase, callback }: Props) => {
  useEffect(() => {
    user.URLBase = URLBase;
  }, [URLBase]);

  const canSubmit = (): boolean => {
    return link.value !== '';
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    callback(link.value, {
      justAudio: downloadJustAudio.value,
      hdTikTok: downloadHDTikTok.value,
    });
    link.value = '';
    downloadJustAudio.value = false;
    downloadHDTikTok.value = false;
  };

  return (
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
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
          >
            <TextField
              label="Link"
              variant="outlined"
              size="small"
              type="url"
              autoComplete="none"
              autoSave="none"
              value={link.value}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const value = e.target.value;
                link.value = value;
              }}
              disabled={isLoading.value}
              style={{ width: '100%' }}
            />
            <Box marginLeft={2}>
              <IconButton
                aria-label="re-download"
                size="small"
                type="submit"
                color="default"
                disabled={isLoading.value || !canSubmit()}
              >
                <Download fontSize="small" />
              </IconButton>
            </Box>
          </Box>
        </Grid>

        <Grid
          item
          xs={12}
          display="flex"
          justifyContent="end"
          justifyItems="center"
        >
          {link.value && isTiktok(link.value) ? (
            <Box width={155} border="0px solid red">
              <Tooltip title={h264VideoInfo}>
                <FormGroup>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={downloadHDTikTok.value}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          (downloadHDTikTok.value = e.target.checked)
                        }
                      />
                    }
                    color="primary.contrastText"
                    label="h264 video"
                    labelPlacement="start"
                    disabled={isLoading.value}
                  />
                </FormGroup>
              </Tooltip>
            </Box>
          ) : null}
          <Box width={140} marginLeft={1} border="0px solid red">
            <FormGroup>
              <FormControlLabel
                control={
                  <Switch
                    checked={downloadJustAudio.value}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      (downloadJustAudio.value = e.target.checked)
                    }
                  />
                }
                color="primary.contrastText"
                label="Just audio"
                labelPlacement="start"
                disabled={isLoading.value}
              />
            </FormGroup>
          </Box>
        </Grid>

        {link.value && isTiktok(link.value) ? (
          <Grid item xs={12}>
            <Alert severity="info">{h264VideoInfo}</Alert>
          </Grid>
        ) : null}

        {error &&
        error.value &&
        error.value.length &&
        error.value[0] &&
        Number(error.value[0].status) === 401 &&
        error.value[0].code === 'no_active_account' ? (
          <Grid item xs={12} marginTop={2}>
            <Stack sx={{ width: '100%' }} spacing={2}>
              <Alert severity="error">Error</Alert>
            </Stack>
          </Grid>
        ) : null}
        {isLoading.value ? (
          <Grid item xs={12} marginTop={1}>
            <Box sx={{ width: '100%' }}>
              <LinearProgress />
            </Box>
          </Grid>
        ) : null}
      </Grid>
    </Box>
  );
};

export default DownloadForm;

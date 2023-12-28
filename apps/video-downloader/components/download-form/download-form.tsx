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
import { BaseUser, isYoutube } from '@repo/utils';
import type { DownloadOptions } from 'classes/item';

const user = signal<BaseUser>(BaseUser.getInstance()).value;
const isLoading: Signal<boolean> = signal(false);
const error: Signal<Array<APIPostCreationError>> = signal([]);
const link = signal<string>('');
const isYoutubeLink: Signal<boolean> = signal(false);
const downloadJustAudio: Signal<boolean> = signal(false);

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
    });
    link.value = '';
    isYoutubeLink.value = false;
    downloadJustAudio.value = false;
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
                isYoutubeLink.value = isYoutube(value);
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
        {isYoutubeLink.value ? (
          <Grid item xs={12}>
            <Box
              display="flex"
              justifyContent="space-between"
              alignItems="center"
            >
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
                  disabled={isLoading.value}
                />
              </FormGroup>
            </Box>
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

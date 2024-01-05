import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import LinearProgress from '@mui/material/LinearProgress';
import { Signal, signal } from '@preact/signals-react';
import { FormEvent, useEffect } from 'react';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import type { APIPostCreationError } from 'utils';
import { API, BaseUser } from 'utils';
import type ItemResponse from 'interfaces/item-response';
import Item, { item } from 'classes/item';

const user = signal<BaseUser>(BaseUser.getInstance()).value;
const isLoading: Signal<boolean> = signal(false);
const error: Signal<Array<APIPostCreationError>> = signal([]);
const link = signal<string>('');

type Props = {
  URLBase: string;
  callback: (url: string) => void;
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
    callback(link.value);
    link.value = '';
  };

  return (
    <Box
      display="flex"
      justifyContent="center"
      component="form"
      noValidate={false}
      autoComplete="on"
      onSubmit={handleSubmit}
      marginTop={4}
      marginBottom={4}
    >
      <Grid container columnSpacing={2} rowSpacing={2} maxWidth={400}>
        <Grid item xs={12}>
          <TextField
            label="Link"
            variant="outlined"
            size="small"
            type="url"
            value={link.value}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              (link.value = e.target.value)
            }
            disabled={isLoading.value}
            style={{ width: '100%' }}
          />
        </Grid>
        <Grid
          item
          xs={12}
          marginTop={1}
          sx={{
            display: 'flex',
            justifyContent: 'right',
          }}
        >
          <Button
            variant="contained"
            type="submit"
            size="small"
            disabled={isLoading.value || !canSubmit()}
          >
            Download
          </Button>
        </Grid>
        {error.value.length &&
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

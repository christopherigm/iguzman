import { ReactElement, FormEvent, useEffect } from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import { GetIconByName, MenuItemWithIcon } from '@repo/ui';
import { BaseUserAddress } from '@repo/utils';
import { Signal, signal } from '@preact-signals/safe-react';
import Divider from '@mui/material/Divider';
import Stand from 'classes/stand';

const isLoading: Signal<boolean> = signal(false);
const complete: Signal<boolean> = signal(false);
const error: Signal<string> = signal('');

type Props = {
  darkMode: boolean;
  stand: Stand;
  onCancel: () => void;
  onComplete: () => void;
};

const CompanyForm = ({
  darkMode = false,
  stand,
  onCancel,
  onComplete,
}: Props): ReactElement => {
  useEffect(() => {
    isLoading.value = false;
    complete.value = false;
    error.value = '';
  }, []);

  const canSubmit = (): boolean => {
    return true;
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    isLoading.value = true;
    complete.value = false;
    error.value = '';
  };

  const onDelete = () => {
    isLoading.value = true;
    // address.DeleteUserAddress().finally(() => {
    //   isLoading.value = false;
    //   onComplete();
    // });
  };

  return (
    <Box
      component="form"
      noValidate={false}
      autoComplete="on"
      onSubmit={(e: FormEvent) => onSubmit(e)}
    >
      <Grid container marginTop={0} columnSpacing={2} rowSpacing={2}>
        <Grid item xs={12} sm={6}>
          <TextField
            label="Nombre de la empresa"
            variant="outlined"
            size="small"
            type="text"
            value={stand.attributes.name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              (stand.attributes.name = e.target.value)
            }
            disabled={isLoading.value}
            style={{ width: '100%' }}
          />
        </Grid>
      </Grid>
    </Box>
  );
};

export default CompanyForm;

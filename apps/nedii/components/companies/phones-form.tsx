import { ReactElement, useEffect } from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import { Signal, signal } from '@preact-signals/safe-react';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import StandPhone from 'classes/stand/stand-phone';
import LinearProgress from '@mui/material/LinearProgress';

const tempPhone: Signal<string> = signal('');
const isLoadingLocal: Signal<boolean> = signal(false);

type Props = {
  isLoading: boolean;
  phones: Array<StandPhone>;
  standId: number;
  onChnage: () => void;
};

const PhonesForm = ({
  isLoading = false,
  phones,
  standId,
  onChnage,
}: Props): ReactElement => {
  useEffect(() => {}, [phones.length]);

  const deletePhone = (index: number): void => {
    phones.splice(index, 1);
    onChnage();
  };

  return (
    <Box>
      <Grid container columnSpacing={2} rowSpacing={2}>
        <Grid item xs={12}>
          <Box marginTop={2} marginBottom={2}>
            <Divider />
          </Box>
          <Typography variant="body1">Telefonos de la empresa</Typography>
        </Grid>
        <Grid
          item
          xs={12}
          md={6}
          sx={{
            display: 'flex',
            justifyContent: 'right',
          }}
        >
          <TextField
            label="Telefono de la empresa"
            variant="outlined"
            size="small"
            type="tel"
            name="phone"
            value={tempPhone.value}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              (tempPhone.value = e.target.value)
            }
            disabled={isLoading || isLoadingLocal.value}
            style={{ width: '100%' }}
          />
          <Button
            variant="contained"
            size="small"
            sx={{
              marginLeft: 2,
              width: 100,
              textTransform: 'initial',
            }}
            disabled={isLoading || isLoadingLocal.value}
            onClick={() => {
              isLoadingLocal.value = true;
              const newPhone = new StandPhone();
              newPhone.attributes.phone = tempPhone.value;
              newPhone.relationships.stand.data.id = standId;
              newPhone
                .save()
                .then(() => {
                  phones.push(newPhone);
                  phones = [...phones];
                  tempPhone.value = '';
                  onChnage();
                })
                .catch((e) => console.log('Error adding phone', e))
                .finally(() => (isLoadingLocal.value = false));
            }}
          >
            Agregar
          </Button>
        </Grid>
        {isLoading || isLoadingLocal.value ? (
          <Grid item xs={12}>
            <Box sx={{ width: '100%' }}>
              <LinearProgress />
            </Box>
          </Grid>
        ) : null}
        <Grid item xs={12}>
          {phones.map((i: StandPhone, index: number) => {
            return (
              <Chip
                key={index}
                label={i.attributes.phone}
                variant="outlined"
                style={{
                  marginRight: 10,
                  marginBottom: 10,
                }}
                onDelete={() => deletePhone(index)}
                disabled={isLoading || isLoadingLocal.value}
              />
            );
          })}
        </Grid>
      </Grid>
    </Box>
  );
};

export default PhonesForm;

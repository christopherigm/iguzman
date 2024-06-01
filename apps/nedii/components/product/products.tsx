import { ReactElement, FormEvent, useEffect } from 'react';
import { user } from 'classes/user';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import { Signal, signal } from '@preact-signals/safe-react';
import Divider from '@mui/material/Divider';
import Stand from 'classes/stand';
import { GenericImageInput } from '@repo/ui';
import Avatar from '@mui/material/Avatar';
import StandPicture from 'classes/stand/stand-picture';

const isLoadingLocal: Signal<boolean> = signal(false);
const complete: Signal<boolean> = signal(false);
const error: Signal<string> = signal('');

type Props = {
  isLoading: boolean;
  darkMode: boolean;
  URLBase: string;
  stand: Stand;
  onCancel: () => void;
  onIncomplete: () => void;
  onComplete: () => void;
};

const Products = ({
  isLoading = false,
  darkMode = false,
  URLBase,
  stand,
  onCancel,
  onIncomplete,
  onComplete,
}: Props): ReactElement => {
  useEffect(() => {
    console.log('CompanyFormGallery.tsx > renders');
    isLoadingLocal.value = false;
    complete.value = false;
    error.value = '';
    user.getNediiUserFromLocalStorage();
    user.URLBase = URLBase;
  }, []);

  return (
    <Box component="form" noValidate={false} autoComplete="off">
      <Typography variant="body1">
        Productos de {stand.attributes.name}
      </Typography>
      <Grid container marginTop={0} columnSpacing={2} rowSpacing={2}>
        <Grid item xs={12}>
          {/* <Box width={200} margin="0 auto">
            <GenericImageInput
              label="Logo de la empresa"
              language="es"
              onChange={(img: string) => {
                stand.attributes.img_logo = img;
                // checkCompleteness();
              }}
              height={200}
              width="100%"
              defaultValue={stand.attributes.img_logo}
            />
          </Box> */}
        </Grid>
      </Grid>
    </Box>
  );
};

export default Products;

import { ReactElement } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Divider from '@mui/material/Divider';
import { Languages } from '@repo/utils';

type Props = {
  language: Languages;
  label?: string;
  canDelete?: boolean;
  id?: number;
  isLoading: boolean;
  complete?: boolean;
  canSubmit?: boolean;
  onCancel: () => void;
  onDelete: () => void;
  onComplete: () => void;
};

const GenericFormButtons = ({
  language = 'en',
  label = '',
  canDelete = false,
  id = 0,
  isLoading,
  complete = true,
  canSubmit = true,
  onCancel,
  onDelete,
  onComplete,
}: Props): ReactElement => {
  return (
    <Grid container rowSpacing={2} marginTop={1}>
      <Grid item xs={12}>
        <Box>
          <Divider />
        </Box>
      </Grid>
      <Grid
        item
        xs={12}
        sx={{
          display: 'flex',
          justifyContent: 'right',
        }}
      >
        <Button
          variant="contained"
          size="small"
          onClick={() => onCancel()}
          color="inherit"
          sx={{ textTransform: 'initial' }}
        >
          {language === 'en' ? <>{complete ? 'Return' : 'Cancel'}</> : null}
          {language === 'es' ? <>{complete ? 'Regresar' : 'Cancelar'}</> : null}
        </Button>
        {id && canDelete ? (
          <Button
            variant="contained"
            size="small"
            disabled={isLoading || !canSubmit}
            onClick={() => onDelete()}
            color="error"
            sx={{
              marginLeft: '15px',
              textTransform: 'initial',
            }}
          >
            {language === 'en' ? <>Delete </> : null}
            {language === 'es' ? <>Eliminar </> : null}
          </Button>
        ) : null}
        <Button
          variant="contained"
          type="submit"
          size="small"
          disabled={isLoading || !canSubmit}
          sx={{
            marginLeft: '15px',
            textTransform: 'initial',
          }}
          onClick={() => onComplete()}
        >
          {language === 'en' ? (
            <>
              {id ? 'Update' : 'Create'} {label}
            </>
          ) : null}
          {language === 'es' ? (
            <>
              {id ? 'Actualizar' : 'Crear'} {label}
            </>
          ) : null}
        </Button>
      </Grid>
    </Grid>
  );
};

export default GenericFormButtons;

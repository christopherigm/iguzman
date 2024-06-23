import { ReactElement } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Divider from '@mui/material/Divider';
import { Languages } from '@repo/utils';
import LoadingButton from '@mui/lab/LoadingButton';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';

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
          justifyContent: 'end',
        }}
      >
        <Button
          variant="contained"
          size="small"
          onClick={() => onCancel()}
          disabled={isLoading}
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
            disabled={isLoading}
            onClick={() => onDelete()}
            color="error"
            sx={{
              marginLeft: '10px',
              textTransform: 'initial',
            }}
          >
            {language === 'en' ? <>Delete </> : null}
            {language === 'es' ? <>Eliminar </> : null}
          </Button>
        ) : null}
        <LoadingButton
          variant="contained"
          type="submit"
          size="small"
          disabled={isLoading || !canSubmit}
          sx={{
            marginLeft: '10px',
            textTransform: 'initial',
          }}
          onClick={() => onComplete()}
          loading={isLoading}
          loadingPosition="start"
          startIcon={<SaveIcon />}
        >
          {language === 'en' ? <>Save</> : null}
          {language === 'es' ? <>Guardar</> : null}
        </LoadingButton>
      </Grid>
    </Grid>
  );
};

export default GenericFormButtons;

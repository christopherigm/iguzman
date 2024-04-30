import { ReactElement } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Divider from '@mui/material/Divider';

type Props = {
  standID: number;
  isLoading: boolean;
  complete: boolean;
  canSubmit: () => boolean;
  onCancel: () => void;
  onDelete: () => void;
};

const CompanyFormButtons = ({
  standID,
  isLoading,
  complete,
  canSubmit,
  onCancel,
  onDelete,
}: Props): ReactElement => {
  return (
    <>
      <Grid item xs={12} marginBottom={2}>
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
          disabled={isLoading || !canSubmit()}
          onClick={() => onCancel()}
          color="inherit"
          sx={{ textTransform: 'initial' }}
        >
          {complete ? 'Regresar' : 'Cancelar'}
        </Button>
        {standID ? (
          <Button
            variant="contained"
            size="small"
            disabled={isLoading || !canSubmit()}
            onClick={() => onDelete()}
            color="error"
            sx={{
              marginLeft: '15px',
              textTransform: 'initial',
            }}
          >
            Eliminar
          </Button>
        ) : null}
        <Button
          variant="contained"
          type="submit"
          size="small"
          disabled={isLoading || !canSubmit()}
          sx={{
            marginLeft: '15px',
            textTransform: 'initial',
          }}
        >
          {standID ? 'Actualizar' : 'Agregar'} empresa
        </Button>
      </Grid>
    </>
  );
};

export default CompanyFormButtons;

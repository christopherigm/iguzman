import { ReactElement } from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Divider from '@mui/material/Divider';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import IconButton from '@mui/material/IconButton';
import { Languages } from '@repo/utils';

type Props = {
  language?: Languages;
  onClick: () => void;
};

const ReturnButtonArrow = ({
  language = 'en',
  onClick,
}: Props): ReactElement => {
  return (
    <Grid container>
      <Grid item xs={12}>
        <Box>
          <Box display="flex" flexDirection="row" justifyContent="start">
            <IconButton
              aria-label="back"
              sx={{ marginRight: 2 }}
              onClick={() => onClick()}
            >
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="body1" marginTop={1}>
              {language === 'en' ? 'Return ' : 'Regresar '}
            </Typography>
          </Box>
        </Box>
      </Grid>
      <Grid item xs={12}>
        <Box marginTop={1} marginBottom={3}>
          <Divider />
        </Box>
      </Grid>
    </Grid>
  );
};

export default ReturnButtonArrow;

import { ReactElement } from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import IconButton from '@mui/material/IconButton';
import { Languages } from '@repo/utils';

type Props = {
  language?: Languages;
  label?: string;
  prevLabel?: string;
  onClick: () => void;
};

const ReturnButtonArrow = ({
  language = 'en',
  label,
  prevLabel,
  onClick,
}: Props): ReactElement => {
  return (
    <>
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
            {label
              ? label
              : language === 'en'
                ? `Return${prevLabel ? ` to ${prevLabel}` : ''}`
                : `Regresar${prevLabel ? ` a ${prevLabel}` : ''}`}
          </Typography>
        </Box>
      </Box>
      <Box marginTop={1} marginBottom={3}>
        <Divider />
      </Box>
    </>
  );
};

export default ReturnButtonArrow;

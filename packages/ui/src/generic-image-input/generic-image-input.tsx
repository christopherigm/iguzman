import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import { ReactElement, useState } from 'react';

type Props = {
  language: 'en' | 'es';
  label: string;
  onChange: (img: string) => void;
  width?: number | string;
  height?: number | string;
  defaultValue?: string;
  labelPosition?: 'top' | 'bottom';
  isLoading?: boolean;
  cleanAfterLoadImage?: boolean;
  hideInstructions?: boolean;
};

const GenericImageInput = ({
  language = 'en',
  label,
  onChange,
  width,
  height,
  defaultValue,
  labelPosition = 'top',
  isLoading = false,
  cleanAfterLoadImage = false,
  hideInstructions = false,
}: Props): ReactElement => {
  const [img, setImg] = useState<string>('');

  return (
    <Box position="relative">
      {labelPosition === 'top' ? (
        <Typography variant="caption">{label}</Typography>
      ) : null}
      <Avatar
        alt={label}
        src={img !== '' ? img : defaultValue}
        variant="rounded"
        sx={{
          width: width,
          height: height,
          boxShadow: '1px 1px 5px rgba(0,0,0,0.5)',
        }}
      />
      <Box
        position="absolute"
        top={20}
        left={0}
        width={width}
        height={height}
        overflow="hidden"
      >
        <input
          type="file"
          id="image"
          disabled={isLoading}
          onChange={(e: any) => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (e: any) => {
              if (!cleanAfterLoadImage) {
                setImg(e.target.result);
              }
              onChange(e.target.result);
            };
            if (file) {
              reader.readAsDataURL(file);
            }
          }}
          accept="image/*"
          style={{
            width: '100%',
            height: '100%',
            cursor: isLoading ? 'auto' : 'pointer',
            opacity: 0,
          }}
        />
      </Box>
      {labelPosition === 'bottom' ? (
        <Box marginTop={0.5}>
          <Typography variant="caption">{label}</Typography>
        </Box>
      ) : null}
      {!hideInstructions ? (
        <Typography variant="caption">
          {language === 'en' ? (
            <>(Click on picture to change it)</>
          ) : (
            <>(Click en la foto para cambiarla)</>
          )}
        </Typography>
      ) : null}
    </Box>
  );
};

export default GenericImageInput;

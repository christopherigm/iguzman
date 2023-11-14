import React, {
  ReactElement,
} from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { GenericImage } from 'ui';
import type { ExpoInterface } from 'interfaces/stand-interface';
import {
  red,
} from '@mui/material/colors';

type Props = {
  selected: boolean;
  onClick: () => void;
  expo: ExpoInterface;
};

const ExpoItem = ({
    selected,
    onClick,
    expo,
  }: Props): ReactElement => {

  return (
    <Box
      border='1px solid #ccc'
      borderRadius={2}
      overflow='hidden'
      onClick={onClick}
      sx={{
        cursor: 'pointer',
        opacity: selected ? 1 : 0.4
      }}>
      {
        !expo.attributes.is_real ?
          <Box position='relative'>
            <Box
              position='absolute'
              top={10}
              right={0}
              padding='1px 5px 1.5px'
              zIndex={10}
              bgcolor={red[500]}
              color={'white'}
              borderRadius='3px 0 0 3px'
              boxShadow='0 0 5px 1px #333'>
              <Typography
                variant='body2'
                color={'white'}
                fontWeight={500}>
                Expo virtual
              </Typography>
            </Box>
          </Box> : null
      }
      <GenericImage
        src={expo.attributes.img_picture}
        alt={expo.attributes.name}
        xs={120}
        sm={150}
        md={170} />
      <Box
        display='flex'
        flexDirection='row'
        justifyContent='center'
        padding={1.5}>
        <Typography
          variant='body1'
          textAlign='center'
          noWrap={true}>
          {expo.attributes.name}
        </Typography>
        <Box
          marginTop={0.4}
          marginLeft={0.5}>
          {
            selected ?
              <CheckCircleIcon sx={{
                color: 'green',
                fontSize: 18,
              }}/> : null
          }
        </Box>
      </Box>
    </Box>
  );
};

export default ExpoItem;

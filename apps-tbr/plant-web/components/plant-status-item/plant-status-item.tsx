import React, {
  ReactElement,
  useState,
} from 'react';

import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';

import {
  getStatusBackground,
  getStatusByRange,
} from 'local-utils/sensor-data-parser';

interface PlantStatusItemProps {
  value: number;
  min: number;
  max: number;
  label: string;
  icon: ReactElement;
  darkMode: boolean;
  unit: string;
  isDisabled: boolean;
  detailEnabled?: boolean;
  displayLabel?: boolean;
}

const disabledBackgroundColor = 'radial-gradient(circle, rgba(0,0,0,0) 0%, rgba(0,0,0,0.6) 100%);';

const PlantStatusItem = ({
    value,
    min,
    max,
    label,
    icon,
    darkMode,
    unit,
    isDisabled,
    detailEnabled = true,
    displayLabel = true,
  }: PlantStatusItemProps): ReactElement => {
  const [displayDetail, setDisplayDetail] = useState(false);

  const {
    diff,
    offset,
    color,
  } = getStatusByRange({
    min: min,
    max: max,
    current: value
  });

  return (
    <Paper elevation={1} sx={{
        background: isDisabled ? disabledBackgroundColor :
        displayDetail ? null : getStatusBackground(offset)
      }}>
      {
        detailEnabled && displayDetail ?
          <Box
            onClick={() => setDisplayDetail((_p) => !_p)}
            padding={1.5}
            sx={{
              cursor: 'pointer'
            }}>
            <Box
              display='flex'
              justifyContent='space-evenly'
              color={ isDisabled ? '#777' : color}>
              {icon}
            </Box>
            <Box
              marginTop={1}>
              <Divider />
            </Box>
            <Typography
              variant='body1'
              textAlign='left'
              color={darkMode ? 'primary.contrastText' : ''}
              paddingTop={1}>
              Current: <b>{value}{unit}</b>
            </Typography>
            <Typography
              variant='body1'
              textAlign='left'
              color={darkMode ? 'primary.contrastText' :''}>
              Minimum: <b>{min}{unit}</b>
            </Typography>
            <Typography
              variant='body1'
              textAlign='left'
              color={darkMode ? 'primary.contrastText' :''}>
              Maximum: <b>{max}{unit}</b>
            </Typography>
            {
              diff === 0 ? null :
              <Typography
                variant='body1'
                textAlign='left'
                color={darkMode ? 'primary.contrastText' : ''}>
                {
                  value > max ?
                    <>Diff: {diff}{unit} more!</> :
                    <>Diff: {diff}{unit} less!</>
                }
              </Typography>
            }
            {
              offset === 0 ? null :
                <>
                  <Box
                    marginTop={1}
                    marginBottom={2}>
                    <Divider />
                  </Box>
                  <Box
                    display='flex'
                    justifyContent='stretch'
                    marginBottom={1}
                    borderRadius='15px'>
                    <Box
                      flexGrow={1}
                      bgcolor='#ef5350'
                      borderRadius='15px 0 0 15px'
                      display='flex'
                      justifyContent='center'>
                      {
                        offset < 0 ?
                        <Box
                          bgcolor='white'
                          height='5px'
                          width='5px'
                          sx={{
                            ":before": {
                              content: '""',
                              marginLeft: '-6px',
                              marginTop: '-6px',
                              display: 'block',
                              bgcolor: '#03a9f4',
                              height: '12px',
                              width: '12px',
                              borderRadius: '12px',
                              border: '3px solid white'
                            }
                          }}>
                        </Box> : null
                      }
                    </Box>
                    <Box
                      flexGrow={2}
                      bgcolor='#66bb6a'
                      margin='0 3px'>
                    </Box>
                    <Box
                      flexGrow={1}
                      bgcolor='#ef5350'
                      borderRadius='0 15px 15px 0'
                      display='flex'
                      justifyContent='center'>
                      {
                        offset > 0 ?
                        <Box
                          bgcolor='white'
                          height='5px'
                          width='5px'
                          sx={{
                            ":before": {
                              content: '""',
                              marginLeft: '-6px',
                              marginTop: '-6px',
                              display: 'block',
                              bgcolor: '#03a9f4',
                              height: '12px',
                              width: '12px',
                              borderRadius: '12px',
                              border: '3px solid white'
                            }
                          }}>
                        </Box> : null
                      }
                    </Box>
                  </Box>
                  <Typography
                    variant='body2'
                    textAlign='center'
                    color={darkMode ? 'primary.contrastText' : ''}
                    paddingBottom={displayLabel ? 0 : 1}>
                    {
                      value > max ?
                        <>{offset}% out of range</> :
                        <>{offset}% out of range</>
                    }
                  </Typography>
                </>
            }
            {
              displayLabel ?
                <>
                  <Box
                    marginTop={1}
                    marginBottom={0.5}>
                    <Divider />
                  </Box>
                  <Typography
                    variant='body1'
                    textAlign='center'
                    color={darkMode ? 'primary.contrastText' :''}
                    noWrap={true}
                    paddingTop={0.5}>
                    {label}
                  </Typography>
                </> : null
            }
          </Box> :
          <Box
            onClick={() => setDisplayDetail((_p) => !_p)}
            style={{
              cursor: 'pointer'
            }}>
            <Box
              justifyContent={'center'}
              display={'flex'}
              paddingTop={1.5}
              color={ isDisabled ? '#777' : color}>
              {icon}
            </Box>
            <Typography
              variant='body1'
              textAlign='center'
              color={darkMode ? 'primary.contrastText' : ''}
              paddingTop={1}
              paddingBottom={displayLabel ? 0 : 1}
              noWrap>
              {value}{unit}
            </Typography>
            {
              displayLabel ?
                <Typography
                  variant='body1'
                  textAlign='center'
                  color={darkMode ? 'primary.contrastText' :''}
                  noWrap={true}
                  paddingBottom={1}>
                  {label}
                </Typography> : null
            }
          </Box>
      }
    </Paper>
  );
}

export default PlantStatusItem;

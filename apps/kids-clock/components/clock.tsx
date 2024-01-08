// https://codesandbox.io/p/sandbox/analog-clock-using-react-idkpz?file=%2Fsrc%2Fstyles.css%3A1%2C1-129%2C1
import { Box } from '@mui/material';
import { signal } from '@preact-signals/safe-react';
import { useEffect } from '@preact-signals/safe-react/react';
import { ReactElement } from 'react';

type ClockNumberProps = {
  num: number;
  right?: string;
  top?: string;
  bottom?: string;
  left?: string;
};

const ClockNumber = ({
  num,
  right,
  top,
  bottom,
  left,
}: ClockNumberProps): ReactElement => {
  return (
    <Box
      position="absolute"
      fontFamily="'Source Sans Pro', sans-serif"
      fontWeight={700}
      top={top ?? ''}
      right={right ?? ''}
      bottom={bottom ?? ''}
      left={left ?? ''}
    >
      {num}
    </Box>
  );
};

const time = signal<Date | null>(null);
const m = signal(0);
const h = signal(20);
const s = signal(15);

type ClockProps = {
  darkMode: boolean;
  fixedTime?: Date;
  size?: number;
};

const Clock = ({ darkMode, fixedTime, size = 300 }: ClockProps) => {
  m.value = fixedTime
    ? fixedTime.getMinutes()
    : time.value
      ? time.value.getMinutes()
      : 0;
  h.value = fixedTime
    ? fixedTime.getHours() + (m.value * 100) / 60 / 100
    : time.value
      ? time.value.getHours() + (m.value * 100) / 60 / 100
      : 20;
  s.value = fixedTime
    ? fixedTime.getSeconds()
    : time.value
      ? time.value.getSeconds()
      : 15;

  useEffect(() => {
    if (!fixedTime) {
      setInterval(() => (time.value = new Date()), 1000);
    }
  }, []);

  return (
    <Box position="relative" width={size} height={size} margin="0 auto">
      <Box
        position="absolute"
        top="50%"
        left="50%"
        width={size}
        height={size}
        borderRadius={'50%'}
        sx={{
          transform: 'translate(-50%, -50%)',
          backgroundColor: darkMode ? '#777' : 'white',
          '::after': {
            backgroundColor: darkMode ? '#ddd' : '#aaa',
            content: '""',
            width: 15,
            height: 15,
            borderRadius: '50%',
            position: 'absolute',
            zIndex: 2,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          },
        }}
        boxShadow="0 2px 30px rgba(0, 0, 0, 0.2)"
        fontSize={24}
        color="#444"
        textAlign="center"
      >
        <Box color={darkMode ? 'white' : 'black'}>
          <ClockNumber num={12} top="3%" left="47%" />
          <ClockNumber num={1} top="10%" right="26%" />
          <ClockNumber num={2} top="25%" right="10%" />
          <ClockNumber num={3} top="45%" right="3%" />
          <ClockNumber num={4} top="66%" right="10%" />
          <ClockNumber num={5} bottom="9%" right="26%" />
          <ClockNumber num={6} bottom="3%" left="48.5%" />
          <ClockNumber num={7} bottom="9%" left="26%" />
          <ClockNumber num={8} top="66%" left="10%" />
          <ClockNumber num={9} top="45%" left="3%" />
          <ClockNumber num={10} top="25%" left="10%" />
          <ClockNumber num={11} top="10%" left="26%" />
        </Box>
        <Box
          position="absolute"
          width={6}
          height={'24%'}
          bottom="50%"
          left="calc(50% - 3px)"
          sx={{
            transformOrigin: 'bottom',
            backgroundColor: '#222',
            transform: `rotateZ(${h.value * 30}deg)`,
          }}
        />
        <Box
          position="absolute"
          width={4}
          height={'34%'}
          bottom="50%"
          left="calc(50% - 2px)"
          sx={{
            transformOrigin: 'bottom',
            backgroundColor: '#222',
            transform: `rotateZ(${m.value * 6}deg)`,
          }}
        />
        <Box
          position="absolute"
          width={2}
          height={'38%'}
          bottom="50%"
          left="calc(50% - 1px)"
          sx={{
            transformOrigin: 'bottom',
            backgroundColor: 'red',
            transform: `rotateZ(${s.value * 6}deg)`,
          }}
        />
      </Box>
    </Box>
  );
};

export default Clock;

import React, { ReactElement, useReducer } from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Checkbox from '@mui/material/Checkbox';
import Divider from '@mui/material/Divider';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import TextField from '@mui/material/TextField';
import Switch from '@mui/material/Switch';
import PaperCard from '../paper-card';

import type { Action, CreationErrorInput } from '@repo/utils';

type State = {
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  monday_open?: string;
  monday_close?: string;
  tuesday_open?: string;
  tuesday_close?: string;
  wednesday_open?: string;
  wednesday_close?: string;
  thursday_open?: string;
  thursday_close?: string;
  friday_open?: string;
  friday_close?: string;
  saturday_open?: string;
  saturday_close?: string;
  sunday_open?: string;
  sunday_close?: string;
};

const InitialState: State = {
  monday: false,
  tuesday: false,
  wednesday: false,
  thursday: false,
  friday: false,
  saturday: false,
  sunday: false,
  monday_open: '',
  monday_close: '',
  tuesday_open: '',
  tuesday_close: '',
  wednesday_open: '',
  wednesday_close: '',
  thursday_open: '',
  thursday_close: '',
  friday_open: '',
  friday_close: '',
  saturday_open: '',
  saturday_close: '',
  sunday_open: '',
  sunday_close: '',
};

type WeekDay =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

const i18 = {
  en: {
    monday: 'Monday',
    tuesday: 'Tuesday',
    wednesday: 'Wednesday',
    thursday: 'Thursday',
    friday: 'Friday',
    saturday: 'Saturday',
    sunday: 'Sunday',
  },
  es: {
    monday: 'Lunes',
    tuesday: 'Martes',
    wednesday: 'Miercoles',
    thursday: 'Jueves',
    friday: 'Viernes',
    saturday: 'Sabado',
    sunday: 'Domingo',
  },
};

const Reducer = (
  state: State = InitialState,
  action: Action<null, CreationErrorInput>
): State => {
  if (action.type === 'input' && action.name) {
    return {
      ...state,
      [action.name]: action.value,
    };
  }
  throw new Error('Invalid action');
};

type CheckBoxProps = {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
};

const CheckBox = ({ label, value, onChange }: CheckBoxProps): ReactElement => {
  return (
    <FormGroup>
      <FormControlLabel
        control={
          <Checkbox
            value={value}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onChange(e.target.checked)
            }
          />
        }
        label={label}
      />
    </FormGroup>
  );
};

type TimeInputProps = {
  weekDay: WeekDay;
  language: 'en' | 'es';
  open: string;
  close: string;
  onChange: (name: string, value: string) => void;
};

const TimeInput = ({
  weekDay,
  language,
  open,
  close,
  onChange,
}: TimeInputProps): ReactElement => {
  const getWeekDayLabel = (): string => {
    return i18[language][weekDay];
  };

  return (
    <Grid item xs={12} sm={6} md={4}>
      <Box
        display="flex"
        flexDirection="column"
        padding={1}
        paddingBottom={2}
        border="1px solid #ccc"
        borderRadius={2}
      >
        <Typography variant="body2" align="center">
          {getWeekDayLabel()}
        </Typography>
        <Box marginTop={1} marginBottom={2}>
          <Divider />
        </Box>
        <Box display="flex" flexDirection="row" justifyContent="space-evenly">
          <TextField
            label={language === 'en' ? 'Opening' : 'Apertura'}
            variant="outlined"
            size="small"
            type="time"
            value={open}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onChange(`${weekDay}_open`, e.target.value)
            }
            disabled={false}
            sx={{
              input: {
                paddingLeft: open ? '' : '65px',
              },
            }}
          />
          <TextField
            label={language === 'en' ? 'Closing' : 'Cierre'}
            variant="outlined"
            size="small"
            type="time"
            value={close}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onChange(`${weekDay}_close`, e.target.value)
            }
            disabled={false}
            sx={{
              input: {
                paddingLeft: close ? '' : '65px',
              },
            }}
          />
        </Box>
      </Box>
    </Grid>
  );
};

type Props = {
  title: string;
  language: 'en' | 'es';
  always_open: boolean;
  onChange: (name: string, value: string | boolean) => void;
};

const WeekSchedule = ({
  title,
  language = 'en',
  always_open = false,
  onChange,
}: Props): ReactElement => {
  const [state, dispatch] = useReducer(Reducer, InitialState);

  const onDispatch = (name: string, value: string | boolean) => {
    dispatch({
      type: 'input',
      name: name,
      value: value,
    });
    onChange(name, value);
  };

  const getWeekDayLabel = (weekDay: WeekDay): string => {
    return i18[language][weekDay];
  };

  const enableTimeInput = (weekDay: WeekDay, value: boolean) => {
    if (value) {
      onDispatch(`${weekDay}_open`, '09:00');
      onDispatch(`${weekDay}_close`, '17:00');
    } else {
      onDispatch(`${weekDay}_open`, '');
      onDispatch(`${weekDay}_close`, '');
    }
    onDispatch(weekDay, value);
  };

  return (
    <PaperCard>
      <Box
        display="flex"
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{
          display: {
            xs: 'none',
            sm: 'flex',
          },
        }}
      >
        <Typography variant="body1">{title}</Typography>
        <FormGroup>
          <FormControlLabel
            control={
              <Switch
                checked={always_open}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  onChange('always_open', e.target.checked)
                }
              />
            }
            label={language === 'en' ? 'Open 24 hours' : 'Abierto 24 horas'}
          />
        </FormGroup>
      </Box>
      <Box
        sx={{
          display: {
            xs: 'block',
            sm: 'none',
          },
        }}
      >
        <Typography variant="body1">{title}</Typography>
        <Box marginTop={2} marginBottom={1}>
          <Divider />
        </Box>
        <FormGroup>
          <FormControlLabel
            control={
              <Switch
                checked={always_open}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  onChange('always_open', e.target.checked)
                }
              />
            }
            label={language === 'en' ? 'Open 24 hours' : 'Abierto 24 horas'}
          />
        </FormGroup>
      </Box>
      {!always_open ? (
        <>
          <Box marginTop={1} marginBottom={1}>
            <Divider />
          </Box>
          <Box
            display="flex"
            flexDirection="row"
            alignItems="center"
            flexWrap="wrap"
          >
            <CheckBox
              value={state.monday}
              label={getWeekDayLabel('monday')}
              onChange={(v) => enableTimeInput('monday', v)}
            />
            <CheckBox
              value={state.tuesday}
              label={getWeekDayLabel('tuesday')}
              onChange={(v) => {
                onDispatch('tuesday_open', '09:00');
                onDispatch('tuesday_close', '17:00');
                onDispatch('tuesday', v);
              }}
            />
            <CheckBox
              value={state.wednesday}
              label={getWeekDayLabel('wednesday')}
              onChange={(v) => {
                onDispatch('wednesday_open', '09:00');
                onDispatch('wednesday_close', '17:00');
                onDispatch('wednesday', v);
              }}
            />
            <CheckBox
              value={state.thursday}
              label={getWeekDayLabel('thursday')}
              onChange={(v) => {
                onDispatch('thursday_open', '09:00');
                onDispatch('thursday_close', '17:00');
                onDispatch('thursday', v);
              }}
            />
            <CheckBox
              value={state.friday}
              label={getWeekDayLabel('friday')}
              onChange={(v) => {
                onDispatch('friday_open', '09:00');
                onDispatch('friday_close', '17:00');
                onDispatch('friday', v);
              }}
            />
            <CheckBox
              value={state.saturday}
              label={getWeekDayLabel('saturday')}
              onChange={(v) => {
                onDispatch('saturday_open', '09:00');
                onDispatch('saturday_close', '17:00');
                onDispatch('saturday', v);
              }}
            />
            <CheckBox
              value={state.sunday}
              label={getWeekDayLabel('sunday')}
              onChange={(v) => {
                onDispatch('sunday_open', '09:00');
                onDispatch('sunday_close', '17:00');
                onDispatch('sunday', v);
              }}
            />
          </Box>
          <Grid container marginTop={1} rowSpacing={2} columnSpacing={2}>
            {state.monday ? (
              <TimeInput
                weekDay="monday"
                language={language}
                open={state.monday_open ? state.monday_open : '09:00'}
                close={state.monday_close ? state.monday_close : '17:00'}
                onChange={(name, value) => onDispatch(name, value)}
              />
            ) : null}
            {state.tuesday ? (
              <TimeInput
                weekDay="tuesday"
                language={language}
                open={state.tuesday_open ? state.tuesday_open : '09:00'}
                close={state.tuesday_close ? state.tuesday_close : '17:00'}
                onChange={(name, value) => onDispatch(name, value)}
              />
            ) : null}
            {state.wednesday ? (
              <TimeInput
                weekDay="wednesday"
                language={language}
                open={state.wednesday_open ? state.wednesday_open : '09:00'}
                close={state.wednesday_close ? state.wednesday_close : '17:00'}
                onChange={(name, value) => onDispatch(name, value)}
              />
            ) : null}
            {state.thursday ? (
              <TimeInput
                weekDay="thursday"
                language={language}
                open={state.thursday_open ? state.thursday_open : '09:00'}
                close={state.thursday_close ? state.thursday_close : '17:00'}
                onChange={(name, value) => onDispatch(name, value)}
              />
            ) : null}
            {state.friday ? (
              <TimeInput
                weekDay="friday"
                language={language}
                open={state.friday_open ? state.friday_open : '09:00'}
                close={state.friday_close ? state.friday_close : '17:00'}
                onChange={(name, value) => onDispatch(name, value)}
              />
            ) : null}
            {state.saturday ? (
              <TimeInput
                weekDay="saturday"
                language={language}
                open={state.saturday_open ? state.saturday_open : '09:00'}
                close={state.saturday_close ? state.saturday_close : '17:00'}
                onChange={(name, value) => onDispatch(name, value)}
              />
            ) : null}
            {state.sunday ? (
              <TimeInput
                weekDay="sunday"
                language={language}
                open={state.sunday_open ? state.sunday_open : '09:00'}
                close={state.sunday_close ? state.sunday_close : '17:00'}
                onChange={(name, value) => onDispatch(name, value)}
              />
            ) : null}
          </Grid>
        </>
      ) : null}
    </PaperCard>
  );
};

export default WeekSchedule;


import FormControl from '@mui/material/FormControl';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import OutlinedInput from '@mui/material/OutlinedInput';
import IconButton from '@mui/material/IconButton';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { useState } from 'react';
import type {
  Action,
  Dispatch
} from 'utils';

type variant = 'filled' | 'outlined' | 'standard';

type Props = {
  label?: string;
  variant?: variant;
  value?: string;
  name?: string;
  onChange?: Dispatch<Action>;
  disabled?: boolean;
}

const PasswordField = ({
    label,
    variant,
    value,
    name='password',
    onChange,
    disabled
  }: Props) => {
  const [showPassword, setShowPassword] = useState<boolean>(false);

  return (
    <FormControl
      variant={variant ? variant : 'outlined'}
      size='small'
      disabled={disabled}
      style={{width: '100%'}}>
      <InputLabel htmlFor='outlined-adornment-password'>
        {label ? label : 'Password'}
      </InputLabel>
      <OutlinedInput
        id='outlined-adornment-password'
        type={showPassword ? 'text' : 'password'}
        endAdornment={
          <InputAdornment position='end'>
            <IconButton
              aria-label='toggle password visibility'
              onClick={() => setShowPassword(v => !v)}
              edge='end'>
              {showPassword ? <VisibilityOff /> : <Visibility />}
            </IconButton>
          </InputAdornment>
        }
        label={label ? label : 'Password'}
        value={value}
        onChange={(e: any) => {
          onChange && onChange({
            type: 'input',
            name,
            value: e.target.value
          });
        }}
      />
    </FormControl>
  );
}

export default PasswordField;

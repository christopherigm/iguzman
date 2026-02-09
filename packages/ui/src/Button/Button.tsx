import MuiButton, {
  type ButtonProps as MuiButtonProps,
} from '@mui/material/Button';

export type ButtonProps = MuiButtonProps;

const Button = (props: ButtonProps) => {
  return <MuiButton {...props} />;
};

export default Button;

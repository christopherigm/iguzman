import { ReactElement, ReactNode } from 'react';
import { Signal } from '@preact-signals/safe-react';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Paper from '@mui/material/Paper';

export type VerticalMenuItemProps = {
  id: number;
  label: string;
  selected: boolean;
};

type ButtonItemProps = {
  id: number;
  label: string;
  selected?: boolean;
  darkMode?: boolean;
  onClick: () => void;
} & VerticalMenuItemProps;

const ButtonItem = ({
  id,
  label,
  selected = false,
  darkMode,
  onClick,
}: ButtonItemProps): ReactNode => {
  return (
    <Button
      key={id}
      onClick={onClick}
      color={selected ? 'primary' : 'inherit'}
      sx={{
        textTransform: 'initial',
        justifyContent: 'left',
        fontWeight: selected ? 'bold' : 'none',
        backgroundColor: selected && darkMode ? 'white' : 'none',
      }}
    >
      {label}
    </Button>
  );
};

type Props = {
  darkMode: boolean;
  items: Signal<Array<VerticalMenuItemProps>>;
};

const VerticalMenu = ({ darkMode = false, items }: Props): ReactElement => {
  const updateSelected = (id: number) => {
    items.value.map((i: VerticalMenuItemProps) => {
      i.selected = i.id === id;
      return i;
    });
    items.value = [...items.value];
  };
  return (
    <Paper elevation={1}>
      <ButtonGroup
        orientation="vertical"
        aria-label="vertical contained button group"
        variant="text"
        color="inherit"
        fullWidth
      >
        {items.value.map((i: VerticalMenuItemProps, index: number) => {
          return (
            <ButtonItem
              {...i}
              key={index}
              darkMode={darkMode}
              onClick={() => updateSelected(i.id)}
            />
          );
        })}
      </ButtonGroup>
    </Paper>
  );
};

export default VerticalMenu;

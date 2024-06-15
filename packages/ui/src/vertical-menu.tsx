import { ReactElement, ReactNode } from 'react';
import { Signal } from '@preact-signals/safe-react';
import { Grid, useMediaQuery, useTheme } from '@mui/material';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Paper from '@mui/material/Paper';

export type VerticalMenuItemProps = {
  id: number;
  label: string;
  selected: boolean;
  completed?: boolean;
  completeIcon: ReactElement | null;
  incompleteIcon: ReactElement | null;
  icon?: ReactElement;
};

type ButtonItemProps = {
  id: number;
  label: string;
  selected?: boolean;
  darkMode?: boolean;
  isXSSize?: boolean;
  onClick: () => void;
} & VerticalMenuItemProps;

const ButtonItem = ({
  id,
  label,
  selected = false,
  completed = false,
  completeIcon,
  incompleteIcon,
  darkMode = false,
  isXSSize = false,
  onClick,
  icon,
}: ButtonItemProps): ReactNode => {
  return (
    <Button
      key={id}
      onClick={onClick}
      color={selected ? 'primary' : 'inherit'}
      fullWidth={true}
      sx={{
        textTransform: 'initial',
        justifyContent: isXSSize ? 'center' : 'left',
        fontWeight: selected ? 'bold' : 'none',
        backgroundColor: selected && darkMode ? 'white' : 'none',
        borderBottom: selected ? '3px solid #1E88E5' : '',
      }}
      startIcon={
        completed && completeIcon
          ? completeIcon
          : !completed && incompleteIcon
            ? incompleteIcon
            : icon ?? null
      }
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
  const theme = useTheme();
  const isXSSize: boolean = useMediaQuery(theme.breakpoints.only('xs'));

  const updateSelected = (id: number) => {
    items.value.map((i: VerticalMenuItemProps) => {
      i.selected = i.id === id;
      return i;
    });
    items.value = [...items.value];
  };

  return (
    <>
      {isXSSize ? (
        <>
          <Grid container spacing={2}>
            {items.value.map((i: VerticalMenuItemProps, index: number) => {
              return (
                <Grid item xs={4} key={index}>
                  <Paper elevation={1}>
                    <ButtonItem
                      {...i}
                      darkMode={darkMode}
                      onClick={() => updateSelected(i.id)}
                      isXSSize={isXSSize}
                    />
                  </Paper>
                </Grid>
              );
            })}
          </Grid>
        </>
      ) : (
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
      )}
    </>
  );
};

export default VerticalMenu;

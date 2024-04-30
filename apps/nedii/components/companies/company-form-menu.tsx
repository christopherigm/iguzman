import { Signal, signal } from '@preact-signals/safe-react';
import type { VerticalMenuItemProps } from '@repo/ui';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';

const menuItems: Signal<Array<VerticalMenuItemProps>> = signal([
  {
    id: 0,
    label: 'Informacion de Expo',
    selected: true,
    completeIcon: <CheckBoxIcon />,
    incompleteIcon: <CheckBoxOutlineBlankIcon />,
  },
  {
    id: 1,
    label: 'Informacion de la empresa',
    selected: false,
    completeIcon: <CheckBoxIcon />,
    incompleteIcon: <CheckBoxOutlineBlankIcon />,
  },
  {
    id: 2,
    label: 'Informacion de contacto',
    selected: false,
    completeIcon: <CheckBoxIcon />,
    incompleteIcon: <CheckBoxOutlineBlankIcon />,
  },
  {
    id: 3,
    label: 'Galeria',
    selected: false,
    completeIcon: <CheckBoxIcon />,
    incompleteIcon: <CheckBoxOutlineBlankIcon />,
  },
  {
    id: 4,
    label: 'Productos',
    selected: false,
    completeIcon: <CheckBoxIcon />,
    incompleteIcon: <CheckBoxOutlineBlankIcon />,
  },
  {
    id: 5,
    label: 'Servicios',
    selected: false,
    completeIcon: <CheckBoxIcon />,
    incompleteIcon: <CheckBoxOutlineBlankIcon />,
  },
  {
    id: 6,
    label: 'Servicios',
    selected: false,
    completeIcon: <CheckBoxIcon />,
    incompleteIcon: <CheckBoxOutlineBlankIcon />,
  },
  {
    id: 7,
    label: 'Comida',
    selected: false,
    completeIcon: <CheckBoxIcon />,
    incompleteIcon: <CheckBoxOutlineBlankIcon />,
  },
  {
    id: 8,
    label: 'Vehiculos',
    selected: false,
    completeIcon: <CheckBoxIcon />,
    incompleteIcon: <CheckBoxOutlineBlankIcon />,
  },
  {
    id: 9,
    label: 'Inmuebles',
    selected: false,
    completeIcon: <CheckBoxIcon />,
    incompleteIcon: <CheckBoxOutlineBlankIcon />,
  },
]);

export default menuItems;

import { Signal, signal } from '@preact-signals/safe-react';
import type { VerticalMenuItemProps } from '@repo/ui';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';

export const NewStandMenu: Array<VerticalMenuItemProps> = [
  {
    id: 0,
    label: 'Informacion de Expo',
    selected: true,
    completed: false,
    completeIcon: <CheckBoxIcon />,
    incompleteIcon: <CheckBoxOutlineBlankIcon />,
  },
  {
    id: 1,
    label: 'Informacion de la empresa',
    selected: false,
    completed: false,
    completeIcon: <CheckBoxIcon />,
    incompleteIcon: <CheckBoxOutlineBlankIcon />,
  },
  {
    id: 2,
    label: 'Informacion de contacto',
    selected: false,
    completed: false,
    completeIcon: <CheckBoxIcon />,
    incompleteIcon: <CheckBoxOutlineBlankIcon />,
  },
  {
    id: 3,
    label: 'Galeria',
    selected: false,
    completed: false,
    completeIcon: <CheckBoxIcon />,
    incompleteIcon: <CheckBoxOutlineBlankIcon />,
  },
];

export const EditStandMenu: Array<VerticalMenuItemProps> = [
  {
    id: 0,
    label: 'Informacion de Expo',
    selected: true,
    completeIcon: null,
    incompleteIcon: null,
  },
  {
    id: 1,
    label: 'Informacion de la empresa',
    selected: false,
    completeIcon: null,
    incompleteIcon: null,
  },
  {
    id: 2,
    label: 'Informacion de contacto',
    selected: false,
    completeIcon: null,
    incompleteIcon: null,
  },
  {
    id: 3,
    label: 'Galeria',
    selected: false,
    completeIcon: null,
    incompleteIcon: null,
  },
  {
    id: 4,
    label: 'Productos',
    selected: false,
    completeIcon: null,
    incompleteIcon: null,
  },
  {
    id: 5,
    label: 'Servicios',
    selected: false,
    completeIcon: null,
    incompleteIcon: null,
  },
  {
    id: 6,
    label: 'Comida',
    selected: false,
    completeIcon: null,
    incompleteIcon: null,
  },
  {
    id: 7,
    label: 'Vehiculos',
    selected: false,
    completeIcon: null,
    incompleteIcon: null,
  },
  {
    id: 8,
    label: 'Inmuebles',
    selected: false,
    completeIcon: null,
    incompleteIcon: null,
  },
];

const menuItems: Signal<Array<VerticalMenuItemProps>> = signal([
  ...EditStandMenu,
]);

export default menuItems;

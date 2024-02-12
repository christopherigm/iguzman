import { Signal, signal } from '@preact-signals/safe-react';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import FavoriteIcon from '@mui/icons-material/Favorite';
import StoreIcon from '@mui/icons-material/Store';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import CategoryIcon from '@mui/icons-material/Category';
import RoomServiceIcon from '@mui/icons-material/RoomService';
import type { TopMenuItem } from '@repo/ui';

const AccountTopMenuItems: Signal<Array<TopMenuItem>> = signal([
  {
    id: 0,
    label: 'Cuenta',
    icon: <AccountCircleIcon />,
    selected: true,
  },
  {
    id: 1,
    label: 'Carrito',
    icon: <ShoppingCartIcon />,
    selected: false,
  },
  {
    id: 2,
    label: 'Favoritos',
    icon: <FavoriteIcon />,
    selected: false,
  },
  {
    id: 3,
    label: 'Empresas',
    icon: <StoreIcon />,
    selected: false,
  },
  {
    id: 4,
    label: 'Productos',
    icon: <CategoryIcon />,
    selected: false,
  },
  {
    id: 5,
    label: 'Servicios',
    icon: <RoomServiceIcon />,
    selected: false,
  },
]);

export default AccountTopMenuItems;

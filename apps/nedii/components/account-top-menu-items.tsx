import { Signal, signal } from '@preact-signals/safe-react';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import FavoriteIcon from '@mui/icons-material/Favorite';
import StoreIcon from '@mui/icons-material/Store';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import CategoryIcon from '@mui/icons-material/Category';
import Payment from '@mui/icons-material/Payment';
import type { TopMenuItem } from '@repo/ui';

const AccountTopMenuItems: Signal<Array<TopMenuItem>> = signal([
  {
    id: 0,
    label: 'Cuenta',
    href: 'account',
    icon: <AccountCircleIcon />,
    selected: true,
  },
  {
    id: 1,
    label: 'Tarjetas',
    href: 'cards',
    icon: <Payment />,
    selected: false,
  },
  {
    id: 2,
    label: 'Carrito',
    href: 'cart',
    icon: <ShoppingCartIcon />,
    selected: false,
  },
  {
    id: 3,
    label: 'Favoritos',
    href: 'favorites',
    icon: <FavoriteIcon />,
    selected: false,
  },
  {
    id: 4,
    label: 'Empresas',
    href: 'companies',
    icon: <StoreIcon />,
    selected: false,
  },
  {
    id: 5,
    label: 'Productos y otros',
    href: 'products',
    icon: <CategoryIcon />,
    selected: false,
  },
]);

export default AccountTopMenuItems;

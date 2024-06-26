import { ReactElement, useEffect } from 'react';
import { user } from 'classes/user';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import { Signal, signal } from '@preact-signals/safe-react';
import Divider from '@mui/material/Divider';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Stand from 'classes/stand';
import { Ribbon, GenericFormButtons, GenericImageInput } from '@repo/ui';
import Product from 'classes/product/product';
import Service from 'classes/service/service';
import InputAdornment from '@mui/material/InputAdornment';
import Paper from '@mui/material/Paper';
import Avatar from '@mui/material/Avatar';
import { IconButton, useMediaQuery, useTheme } from '@mui/material';
import FavoriteIcon from '@mui/icons-material/Favorite';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import Link from 'next/link';

const complete: Signal<boolean> = signal(false);
const error: Signal<string> = signal('');

type Props = {
  children?: ReactElement | Array<ReactElement>;
  item: Product | Service;
  disabled: boolean;
  height?: number;
  onClick: () => void;
};

const BaseBuyableItem = ({
  children,
  item,
  disabled,
  height = 170,
  onClick,
}: Props): ReactElement => {
  const theme = useTheme();
  const isXSSize: boolean = useMediaQuery(theme.breakpoints.only('xs'));

  return (
    <Paper elevation={1} sx={{ overflow: 'hidden' }}>
      <Box
        position="relative"
        width="100%"
        height={height}
        onClick={() => (disabled ? null : onClick())}
        sx={{
          cursor: 'pointer',
        }}
      >
        <Box position="absolute" width="100%" top={0} left={0}>
          <Avatar
            alt={item.attributes.name}
            src={item.attributes.img_picture}
            variant="square"
            sx={{
              width: '100%',
              height: height,
            }}
          />
        </Box>
        {item.attributes.discount ? (
          <Box position="absolute" top={0} right={0}>
            <Ribbon
              borderColor="#f4511e"
              color="#ff5722"
              text={`-${item.attributes.discount}%`}
            />
          </Box>
        ) : null}
        {!item.attributes.shipping_cost ? (
          <Box position="absolute" top={height - 40} right={0}>
            <Ribbon
              borderColor="#f4511e"
              color="#ff5722"
              text="Envio gratis!"
            />
          </Box>
        ) : null}
      </Box>
      <Box
        padding={1}
        onClick={() => (disabled ? null : onClick())}
        sx={{
          cursor: 'pointer',
        }}
      >
        <Typography variant="body1" textAlign="center">
          {item.attributes.name}
        </Typography>
      </Box>
      <Box paddingLeft={1} paddingRight={1} width="100%">
        <Divider />
      </Box>
      <Box
        display="flex"
        justifyContent="center"
        padding={1}
        onClick={() => (disabled ? null : onClick())}
        sx={{
          cursor: 'pointer',
        }}
      >
        {item.attributes.discount ? (
          <Typography
            variant="caption"
            sx={{
              textDecorationLine: 'line-through',
              color: '#f50057',
            }}
          >
            ${item.attributes.price}
          </Typography>
        ) : null}
        <Box padding={0.3}></Box>
        <Typography variant="body1" sx={{ fontWeight: '600' }}>
          ${item.attributes.final_price}
        </Typography>
      </Box>
      <Box paddingLeft={1} paddingRight={1} width="100%">
        <Divider />
      </Box>
      <Box display="flex" alignItems="center" paddingLeft={1} paddingRight={1}>
        {item.type === 'Product' || item.type === 'Service' ? (
          <Typography variant="body2">
            {item.attributes.unlimited_stock ? (
              'Disponible!'
            ) : item.attributes.stock ? (
              <>
                Solo <b>{item.attributes.stock}</b> disponibles!
              </>
            ) : (
              'Agotado'
            )}
          </Typography>
        ) : null}
        <Box flexGrow={1}></Box>
        <Box display="flex">
          <IconButton
            aria-label="add-to-favorites"
            onClick={() => (disabled ? null : item.switchFavorite())}
          >
            <FavoriteIcon
              sx={{ color: item.isFavorite ? '#d32f2f' : '#777' }}
            />
          </IconButton>
          <Box padding={0.3}></Box>
          <IconButton
            aria-label="add-to-cart"
            onClick={() => (disabled ? null : item.switchIsInCart())}
          >
            <ShoppingBagIcon
              sx={{ color: item.isInCart ? '#ffa000' : '#777' }}
            />
          </IconButton>
        </Box>
      </Box>
      <Box paddingLeft={1} paddingRight={1} width="100%">
        <Divider />
      </Box>
      <Link href={`/empresa/${item.relationships.stand.data.attributes.slug}`}>
        <Box
          display="flex"
          justifyContent="start"
          alignItems="center"
          padding={1}
        >
          {item.relationships.stand.data.attributes.img_logo ? (
            <>
              <Avatar
                alt={item.relationships.stand.data.attributes.name}
                src={item.relationships.stand.data.attributes.img_logo}
                variant="circular"
                sx={{
                  width: 36,
                  height: 36,
                }}
              />
              <Box padding={0.5}></Box>
            </>
          ) : null}
          <Typography variant="body2" textAlign="left">
            {item.relationships.stand.data.attributes.name}
          </Typography>
        </Box>
      </Link>
    </Paper>
  );
};

export default BaseBuyableItem;

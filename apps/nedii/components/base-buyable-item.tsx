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
import { useMediaQuery, useTheme } from '@mui/material';
import Link from 'next/link';

const complete: Signal<boolean> = signal(false);
const error: Signal<string> = signal('');

type Props = {
  children?: ReactElement | Array<ReactElement>;
  item: Product | Service;
  height?: number;
  onClick: () => void;
};

const BaseBuyableItem = ({
  children,
  item,
  height = 170,
  onClick,
}: Props): ReactElement => {
  const theme = useTheme();
  const isXSSize: boolean = useMediaQuery(theme.breakpoints.only('xs'));

  useEffect(() => {
    console.log('BaseBuyableItem.tsx > renders');
  }, []);

  return (
    <Paper elevation={1} sx={{ overflow: 'hidden' }}>
      <Box
        position="relative"
        width="100%"
        height={height}
        onClick={() => onClick()}
        sx={{
          cursor: 'pointer',
        }}
      >
        <Box position="absolute" top={0} left={0}>
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
              text={`-${item.attributes.discount}% desc.`}
            />
          </Box>
        ) : null}
      </Box>
      <Box
        padding={1}
        onClick={() => onClick()}
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
        onClick={() => onClick()}
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

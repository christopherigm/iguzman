import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import DeleteIcon from '@mui/icons-material/Delete';
import LinearProgress from '@mui/material/LinearProgress';
import { Signal, signal } from '@preact/signals-react';
import { useCallback, useEffect } from 'react';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import type { APIPostCreationError } from 'utils';
import { PaperCard, CountryField, StateField, CityField } from 'ui';
import { API, BaseUser } from 'utils';
import Item from 'classes/item';
import Link from 'next/link';

const user = signal<BaseUser>(BaseUser.getInstance()).value;

type GridItemProps = {
  item: Item;
  onDeleteItem: (id: string) => void;
};

const GridItem = ({ item, onDeleteItem }: GridItemProps) => {
  return (
    <PaperCard>
      <Box
        marginTop={0}
        marginBottom={1}
        display="flex"
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
      >
        <Typography variant="body1">
          {item.status === 'downloading' ? (
            <>Downloading...</>
          ) : item.status === 'ready' ? (
            <>Video ready!</>
          ) : item.status === 'error' ? (
            <>Error!</>
          ) : (
            <>Unknown</>
          )}
        </Typography>
        {item.status === 'ready' || item.status === 'error' ? (
          <Box display="flex" justifyContent="end">
            {item.status === 'ready' ? (
              <Link
                href={`${item.URLBase}/media/${item.id}.mp4`}
                passHref
                target="_blank"
              >
                <Button variant="contained" type="submit" size="small">
                  Download
                </Button>
              </Link>
            ) : null}
            <Box paddingLeft={2}>
              <IconButton
                aria-label="delete"
                size="small"
                onClick={() => onDeleteItem(item.id)}
                color="error"
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>
        ) : null}
      </Box>
      {item.name ? (
        <>
          <Box marginTop={2} marginBottom={2}>
            <Divider />
          </Box>
          <Typography
            variant="body1"
            noWrap={false}
            overflow="hidden"
            height={'auto'}
          >
            {item.name}
          </Typography>
        </>
      ) : null}
      {item.status === 'ready' ? (
        <Box
          marginTop={1}
          marginBottom={1}
          display="flex"
          justifyContent="center"
        >
          <video
            width={'100%'}
            height={270}
            controls={true}
            autoPlay={false}
            src={`${item.URLBase}/media/${item.id}.mp4`}
          ></video>
        </Box>
      ) : null}
      <Box marginTop={2} marginBottom={2}>
        <Divider />
      </Box>
      <Box
        sx={{
          cursor: 'pointer',
        }}
        onClick={() => {
          navigator.clipboard.writeText(item.url);
        }}
      >
        <Typography variant="body1" noWrap={true}>
          ID: {item.id}
        </Typography>
        <Typography variant="body2" noWrap={true}>
          URL: {item.url}
        </Typography>
      </Box>
    </PaperCard>
  );
};

type Props = {
  items: Array<Item>;
  onDeleteItem: (id: string) => void;
};

const GridOfItems = ({ items, onDeleteItem }: Props) => {
  return (
    <Box display="flex" justifyContent="center">
      <Grid container columnSpacing={2}>
        {items.map((i: Item, index: number) => (
          <Grid item xs={12} md={4} key={index}>
            <GridItem
              item={i}
              onDeleteItem={(id: string) => onDeleteItem(id)}
            />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default GridOfItems;

import React, {
  useEffect,
  ReactElement,
  useState,
} from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Pagination from '@mui/material/Pagination';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import DeleteIcon from '@mui/icons-material/Delete';
import Paper from '@mui/material/Paper';
import GetIconByName from '../get-icon-by-name';
import MUIIcons from '../mui-icons';

const unselectedColor = '#555';

type ItemProps = {
  name: string;
  displayName: string;
  selected: boolean;
  itemSelected?: boolean;
  iconSize?: {
    xs?: number;
    sm?: number;
    md?: number;
    lg?: number;
  };
  color?: string;
  textVariant?: 'caption' | 'body1' | 'body2';
  onClick: (A: string) => void;
  iconPadding?: number;
  paddingTop?: number;
  paddingBottom?: number;
  isLoading?: boolean;
};

const ItemContent = ({
    name,
    displayName,
    selected=false,
    iconSize={xs: 32},
    color='#000',
    textVariant='caption',
    onClick,
    iconPadding=0,
    paddingTop=0.5,
    paddingBottom=0.5,
    isLoading=false,
  }: ItemProps): ReactElement => {
  return (
    <Box
      display='flex'
      flexDirection='column'
      alignItems='center'
      onClick={() => onClick(name)}
      sx={{ cursor: isLoading ? 'auto' : 'pointer' }}
      border={selected ? `1px solid ${color}` : `1px solid ${unselectedColor}`}
      borderRadius={2}
      paddingTop={paddingTop}
      paddingBottom={paddingBottom}>
      <Box
        paddingTop={iconPadding}
        paddingBottom={iconPadding}>
        <GetIconByName
          name={name}
          iconSize={iconSize}
          color={color} />
      </Box>
      <Box
        width='calc(100% - 20px)'
        overflow='hidden'
        display='flex'
        justifyContent='center'>
        <Typography
          variant={textVariant}
          sx={{
            color: selected ? color : unselectedColor,
          }}
          noWrap={true}>
          {displayName}
        </Typography>
      </Box>
    </Box>
  )
};

const Item = ({
    name,
    displayName,
    onClick,
    color='#000',
    selected=false,
    itemSelected=false,
    isLoading=false,
  }: ItemProps): ReactElement => {

  return (
    <Grid item xs={3} sm={2} md={itemSelected ? 2 : 1}>
      <Box sx={{opacity: isLoading ? 0.7 : 1}}>
      {
        selected ?
          <Paper
            elevation={3}
            sx={{
              borderRadius: 2,
              overflow: 'hidden',
            }}>
            <ItemContent
              name={name}
              displayName={displayName}
              onClick={(v) => onClick(v)}
              color={color}
              selected={selected}
              isLoading={isLoading} />
          </Paper> :
          <ItemContent
            name={name}
            displayName={displayName}
            onClick={(v) => onClick(v)}
            color={color}
            selected={selected}
            isLoading={isLoading} />
      }
      </Box>
    </Grid>
  );
};

type ItemsArray = {
  id: number;
  name: string;
  displayName: string;
  selected: boolean;
};

const SplitStringByCapitals = (s: string): string => {
  if (!s || !s.length) {
    return s;
  }
  const splitted = s.split('');
  const newString: Array<string> = [];
  splitted.forEach((i: string) => {
    const code = i.charCodeAt(0);
    if (code < 97) {
      newString.push(' ');
    }
    newString.push(i);
  })
  return newString.join('');
};

type Props = {
  onChange: (A: string) => void;
  isLoading: boolean;
  color?: string;
};

const UIIcons = ({
    onChange,
    isLoading=false,
    color='#000',
  }: Props): ReactElement => {
  const [itemSelected, setItemSelected] = useState<ItemsArray | null>(null);
  const itemsArray: Array<ItemsArray> = MUIIcons.map((i: string, index: number) => {
    return {
      id: index,
      name: i,
      displayName: SplitStringByCapitals(i),
      selected: false
    }
  });
  const itemsPerPage = 36;
  const [page, setPage] = useState<number>(1);
  const [displayedItems, setDisplayedItems] = useState<Array<ItemsArray>>([...itemsArray]);
  const [search, setSearch] = useState<string>('');

  useEffect(() => {
    const items: Array<ItemsArray> = [...itemsArray]
      .filter((i: ItemsArray) => i.name.toLowerCase().indexOf(search.toLowerCase()) > -1 || !search)
      .slice((page - 1) * itemsPerPage, page * itemsPerPage);
    if (itemSelected) {
      items.map((i: ItemsArray) => i.id === itemSelected.id ? i.selected = true : null);
    }
    setDisplayedItems(items);
    setPage(p => search && items.length < itemsPerPage ? 1 : p);
  }, [page, search]);

  const updateItemsArray = (id: number | null) => {
    const items = [...displayedItems];
    items.map((i: ItemsArray) => {
      if (id !== null && i.id === id) {
        i.selected = !i.selected;
      } else {
        i.selected = false;
      }
    });
    setDisplayedItems(items);
  };

  return (
    <Grid container rowSpacing={2}>
      <Grid item xs={12}>
        <Grid container rowSpacing={2}>
          <Grid item xs={12} sm={4} md={3}>
            <Box paddingRight={{ xs: 0, sm: itemSelected ? 3 : 1.5 }}>
              <TextField
                label='Buscar icono por nombre'
                variant='outlined'
                size='small'
                type='text'
                value={search}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                disabled={isLoading}
                sx={{width: '100%'}} />
            </Box>
          </Grid>
          {
            search ?
              <Grid item xs={12} sm={4}>
                <IconButton
                  aria-label='delete'
                  type='button'
                  onClick={() => {
                    if (isLoading) {
                      return;
                    }
                    const page = 1;
                    let items = [...itemsArray];
                    items = items.slice((page - 1) * itemsPerPage, page * itemsPerPage);
                    setDisplayedItems(items);
                    setPage(page);
                    updateItemsArray(null);
                    setSearch('');
                  }}>
                  <DeleteIcon />
                </IconButton>
              </Grid> : null
          }
        </Grid>
      </Grid>
      {
        itemSelected ?
          <Grid item xs={12} sm={4} md={3}>
            <Box
              paddingRight={{
                xs: 0,
                sm: 3,
              }}
              marginBottom={3}>
            <Paper
              elevation={3}
              sx={{
                borderRadius: 2,
                overflow: 'hidden',
                opacity: isLoading ? 0.7 : 1
              }}>
              <ItemContent
                name={itemSelected.name}
                displayName={itemSelected.displayName}
                iconSize={{xs: 72, sm: 96, md: 120}}
                onClick={() => {
                  if (isLoading) {
                    return;
                  }
                  onChange('');
                  setItemSelected(null);
                  updateItemsArray(null);
                }}
                color={color}
                textVariant='body1'
                selected={true}
                iconPadding={3}
                paddingTop={0}
                paddingBottom={3} />
            </Paper>
            </Box>
          </Grid> : null
      }
      <Grid item
        xs={12}
        sm={itemSelected ? 8 : 12}
        md={itemSelected ? 9 : 12}>
        <Grid
          container
          columnSpacing={2}
          rowSpacing={2}>
          {
            displayedItems.map((i: ItemsArray, index: number) =>
              <Item
                name={i.name}
                displayName={i.displayName}
                key={index}
                onClick={(name: string) => {
                  if (isLoading) {
                    return;
                  }
                  if (i.selected) {
                    onChange('');
                    setItemSelected(null);
                    updateItemsArray(null);
                  } else {
                    onChange(name);
                    setItemSelected(i);
                    updateItemsArray(i.id);
                  }
                }}
                color={i.selected ? color : unselectedColor}
                selected={i.selected}
                itemSelected={itemSelected ? true : false}
                isLoading={isLoading} />
            )
          }
        </Grid>
      </Grid>
      <Grid item xs={12}>
        <Box
          display='flex'
          justifyContent='center'
          marginBottom={2}>
        <Stack>
          <Pagination
            count={
              search && displayedItems.length < itemsPerPage ? 1 :
              Math.ceil(itemsArray.length / itemsPerPage)
            }
            page={page}
            onChange={(_e: React.ChangeEvent<unknown>, value: number) => {
              if (isLoading) {
                return;
              }
              setPage(value);
            }} />
        </Stack>
        </Box>
      </Grid>
    </Grid>
  );
};

export default UIIcons;

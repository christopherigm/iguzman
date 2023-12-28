import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import Pagination from '@mui/material/Pagination';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import IconButton from '@mui/material/IconButton';
import DeleteIcon from '@mui/icons-material/Delete';
import AudioIcon from '@mui/icons-material/Audiotrack';
import YouTube from '@mui/icons-material/YouTube';
import Instagram from '@mui/icons-material/Instagram';
import Facebook from '@mui/icons-material/Facebook';
import X from '@mui/icons-material/X';
import Tiktok from '@mui/icons-material/VideoChat';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import GridViewIcon from '@mui/icons-material/GridView';
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import SplitscreenIcon from '@mui/icons-material/Splitscreen';
import ErrorIcon from '@mui/icons-material/Error';
import LinearProgress from '@mui/material/LinearProgress';
import { signal } from '@preact-signals/safe-react';
import { PaperCard } from '@repo/ui';
import { BaseUser, InnerSort, DateParser, HourParser } from '@repo/utils';
import Item, { VideoType } from 'classes/item';
import { ReactElement, ReactNode } from 'react';
import ReactPlayer from 'react-player';
import copy from 'copy-to-clipboard';
import { useEffect } from '@preact-signals/safe-react/react';

type GridItemProps = {
  item: Item;
  onDeleteItem: (id: string) => void;
  miniMode: boolean;
  devMode: boolean;
};

const GridItem = ({ item, onDeleteItem, miniMode, devMode }: GridItemProps) => {
  const URLBase = item.URLBase.substring(0, item.URLBase.length - 4);

  const actionButtons = (
    <>
      {item.status === 'ready' || item.status === 'error' ? (
        <Box marginLeft={0.5} paddingLeft={1} borderLeft="solid 1px #666">
          <IconButton
            aria-label="re-download"
            size="small"
            onClick={() => item.getVideo()}
            color="default"
          >
            <SettingsBackupRestoreIcon fontSize="small" />
          </IconButton>
        </Box>
      ) : null}
      <Box marginLeft={0.5} paddingLeft={1} borderLeft="solid 1px #666">
        <IconButton
          aria-label="delete"
          size="small"
          onClick={() => onDeleteItem(item.id)}
          color="error"
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Box>
    </>
  );

  return (
    <PaperCard>
      <Box
        marginBottom={1}
        display="flex"
        flexDirection="row"
        justifyContent="start"
        alignItems="center"
        paddingTop={0}
      >
        {item.type ? (
          <Box
            marginRight={1}
            paddingRight={1}
            paddingTop={1}
            borderRight="solid 1px #666"
          >
            {item.justAudio ? (
              <AudioIcon fontSize={miniMode ? 'small' : 'medium'} />
            ) : item.type === 'youtube' ? (
              <YouTube fontSize={miniMode ? 'small' : 'medium'} />
            ) : item.type === 'instagram' ? (
              <Instagram fontSize={miniMode ? 'small' : 'medium'} />
            ) : item.type === 'facebook' ? (
              <Facebook fontSize={miniMode ? 'small' : 'medium'} />
            ) : item.type === 'twitter' ? (
              <X fontSize={miniMode ? 'small' : 'medium'} />
            ) : item.type === 'tiktok' ? (
              <Tiktok fontSize={miniMode ? 'small' : 'medium'} />
            ) : null}
          </Box>
        ) : null}
        <Typography
          variant={miniMode ? 'body2' : 'body1'}
          noWrap={true}
          height={'auto'}
        >
          {item.status === 'downloading' ? (
            <>Downloading...</>
          ) : item.status === 'ready' ? (
            <>{item.name ? item.name : ''}</>
          ) : item.status === 'error' ? (
            <>Error!</>
          ) : (
            <>Processing...</>
          )}
        </Typography>
        {!miniMode ? (
          <>
            <Box flexGrow={1}></Box>
            <Box display="flex" justifyContent="end">
              {actionButtons}
            </Box>
          </>
        ) : null}
      </Box>
      <Box marginTop={1} marginBottom={1}>
        <Divider />
      </Box>
      {item.status === 'ready' ? (
        <Box
          display="flex"
          justifyContent="center"
          maxHeight={270}
          maxWidth="100%"
        >
          <ReactPlayer
            url={
              item.filename
                ? `${URLBase}/media/${item.filename}`
                : `${URLBase}/media/${item.id}.${
                    item.justAudio ? 'm4a' : 'mp4'
                  }`
            }
            width="100%"
            height={item.justAudio ? '50px' : miniMode ? '160px' : '270px'}
            playing={false}
            controls
            loop
          />
        </Box>
      ) : null}
      <Box marginTop={1} marginBottom={1}>
        <Divider />
      </Box>
      <Box
        display="flex"
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
      >
        <Typography variant="body2" noWrap={true}>
          {item.url}
        </Typography>
        <Box marginLeft={1} paddingLeft={1} borderLeft="solid 1px #666">
          <IconButton
            aria-label="copy"
            size="small"
            onClick={() => copy(item.url)}
            color="default"
          >
            <ContentCopyIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {miniMode ? (
        <>
          <Box marginTop={1} marginBottom={1}>
            <Divider />
          </Box>
          <Box
            display="flex"
            flexDirection="row"
            justifyContent="start"
            alignItems="center"
          >
            <Box flexGrow={1}></Box>
            {actionButtons}
          </Box>
        </>
      ) : null}
      {devMode ? (
        <>
          <Box marginTop={1} marginBottom={1}>
            <Divider />
          </Box>
          <Box
            display="flex"
            flexDirection="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <Typography variant="body2" noWrap={true}>
              ID: {item.id}
            </Typography>
            <Box marginLeft={1} paddingLeft={1} borderLeft="solid 1px #666">
              <IconButton
                aria-label="copy"
                size="small"
                onClick={() => copy(item.id)}
                color="default"
              >
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>
          {item.created ? (
            <>
              <Box marginTop={1} marginBottom={1}>
                <Divider />
              </Box>
              <Box display="flex" marginTop={1}>
                <Typography variant="body2" noWrap={true}>
                  {DateParser(item.created.toString())} -{' '}
                  {HourParser(item.created.toString())}
                </Typography>
              </Box>
            </>
          ) : null}
          <>
            <Box marginTop={1} marginBottom={1}>
              <Divider />
            </Box>
            <Box display="flex" marginTop={1}>
              <Typography variant="body2" noWrap={false}>
                Filename: {item.filename}
              </Typography>
            </Box>
          </>
          <>
            <Box marginTop={1} marginBottom={1}>
              <Divider />
            </Box>
            <Box display="flex" marginTop={1}>
              <Typography variant="body2" noWrap={false}>
                {item.filename
                  ? `${item.URLBase.substring(
                      0,
                      item.URLBase.length - 4
                    )}/media/${item.filename}`
                  : `${item.URLBase.substring(
                      0,
                      item.URLBase.length - 4
                    )}/media/${item.id}.${item.justAudio ? 'm4a' : 'mp4'}`}
              </Typography>
            </Box>
          </>
          <>
            <Box marginTop={1} marginBottom={1}>
              <Divider />
            </Box>
            <Box display="flex" marginTop={1}>
              <Typography variant="body2" noWrap={true}>
                URLBase: {item.URLBase.substring(0, item.URLBase.length - 4)}
              </Typography>
            </Box>
          </>
        </>
      ) : null}
    </PaperCard>
  );
};

type ButtonFilterProps = {
  children: ReactNode;
  videoType: VideoType;
};

const ButtonFilter = ({
  children,
  videoType,
}: ButtonFilterProps): ReactElement => {
  const selected = filterTypes.value.indexOf(videoType) > -1;
  return (
    <IconButton
      aria-label="miniGrid"
      size="medium"
      onClick={() => {
        const index = filterTypes.value.indexOf(videoType);
        if (index > -1) {
          filterTypes.value.splice(index, 1);
          filterTypes.value = [...filterTypes.value];
        } else {
          filterTypes.value = [...filterTypes.value, videoType];
        }
      }}
      sx={{
        opacity: selected ? '1' : '0.7',
        backgroundColor: selected ? '#333' : '',
        color: selected ? 'white' : '#000',
      }}
    >
      {children}
    </IconButton>
  );
};

type Props = {
  items: Array<Item>;
  onDeleteItem: (id: string) => void;
  devMode: boolean;
};

const miniGrid = signal(false);
const itemsToDisplay = signal(6);
const page = signal(1);
const offset = signal(0);
const filterTypes = signal<Array<VideoType>>([]);
const filterByErrors = signal<boolean>(false);
const filteredItems = signal<Array<Item>>([]);

const GridOfItems = ({ items, onDeleteItem, devMode }: Props): ReactElement => {
  offset.value = (page.value - 1) * itemsToDisplay.value;
  filteredItems.value = items
    .filter((i) => {
      if (!filterTypes.value.length) {
        return i;
      }
      if (i.type && filterTypes.value.indexOf(i.type) > -1) {
        return i;
      }
    })
    .filter((i) => {
      if (!filterByErrors.value) {
        return i;
      } else if (i.status === 'error') {
        return i;
      }
    })
    .sort(InnerSort('_created', 'desc'));

  return (
    <Box display="flex" flexDirection="column">
      <Box display="flex" flexDirection="row" justifyContent="space-between">
        <Box>
          {items.filter((i) => i.type && i.type === 'youtube').length ? (
            <ButtonFilter videoType="youtube">
              <YouTube />
            </ButtonFilter>
          ) : null}
          {items.filter((i) => i.type && i.type === 'instagram').length ? (
            <ButtonFilter videoType="instagram">
              <Instagram />
            </ButtonFilter>
          ) : null}
          {items.filter((i) => i.type && i.type === 'tiktok').length ? (
            <ButtonFilter videoType="tiktok">
              <Tiktok />
            </ButtonFilter>
          ) : null}
          {items.filter((i) => i.type && i.type === 'facebook').length ? (
            <ButtonFilter videoType="facebook">
              <Facebook />
            </ButtonFilter>
          ) : null}
          {items.filter((i) => i.type && i.type === 'twitter').length ? (
            <ButtonFilter videoType="twitter">
              <X />
            </ButtonFilter>
          ) : null}
        </Box>
        <Box display="flex" flexDirection="row">
          <Box marginRight={1}>
            <FormControl fullWidth>
              <InputLabel id="demo-simple-select-label">Items</InputLabel>
              <Select
                labelId="demo-simple-select-label"
                id="demo-simple-select"
                size="small"
                value={String(itemsToDisplay.value)}
                label="Items"
                onChange={(e: SelectChangeEvent) => {
                  itemsToDisplay.value = Number(e.target.value);
                  page.value = 1;
                }}
              >
                <MenuItem value={1}>1</MenuItem>
                <MenuItem value={6}>6</MenuItem>
                <MenuItem value={10}>10</MenuItem>
                <MenuItem value={20}>20</MenuItem>
              </Select>
            </FormControl>
          </Box>
          <Box>
            <IconButton
              aria-label="filterByErrors"
              size="medium"
              onClick={() => (filterByErrors.value = !filterByErrors.value)}
              sx={{
                opacity: filterByErrors.value ? '1' : '0.7',
                backgroundColor: filterByErrors.value ? '#333' : '',
                color: filterByErrors.value ? 'white' : '#000',
              }}
            >
              <ErrorIcon />
            </IconButton>
          </Box>
          <Box marginRight={1}>
            <IconButton
              aria-label="miniGrid"
              size="medium"
              onClick={() => (miniGrid.value = !miniGrid.value)}
              color="default"
            >
              {miniGrid.value ? <SplitscreenIcon /> : <GridViewIcon />}
            </IconButton>
          </Box>
        </Box>
      </Box>
      {devMode ? (
        <>
          <Box>
            <Typography variant="body2" color="white">
              Items length: {items.length}
            </Typography>
          </Box>
          <Box>
            <Typography variant="body2" color="white">
              Filtered Items: {filteredItems.value.length}
            </Typography>
          </Box>
          <Box>
            <Typography variant="body2" color="white">
              Items To Display: {itemsToDisplay.value}
            </Typography>
          </Box>
          <Box>
            <Typography variant="body2" color="white">
              Page: {page.value}
            </Typography>
          </Box>
          <Box>
            <Typography variant="body2" color="white">
              Offset: {offset.value}
            </Typography>
          </Box>
        </>
      ) : null}
      <Grid container columnSpacing={2}>
        {filteredItems.value
          .slice(offset.value, offset.value + itemsToDisplay.value)
          .map((i: Item, index: number) => (
            <Grid
              item
              xs={miniGrid.value ? 6 : 12}
              sm={miniGrid.value ? 4 : 6}
              md={miniGrid.value ? 3 : 4}
              key={index}
            >
              <GridItem
                item={i}
                onDeleteItem={(id: string) => onDeleteItem(id)}
                miniMode={miniGrid.value}
                devMode={devMode}
              />
            </Grid>
          ))}
      </Grid>
      <Box marginTop={2} marginBottom={1}>
        <Divider />
      </Box>
      <Box display="flex" justifyContent="center">
        <Pagination
          count={Math.round(filteredItems.value.length / itemsToDisplay.value)}
          color="primary"
          page={page.value}
          onChange={(_e: React.ChangeEvent<unknown>, value: number) =>
            (page.value = value)
          }
        />
      </Box>
      <Box marginTop={1.5} marginBottom={1}></Box>
    </Box>
  );
};

export default GridOfItems;

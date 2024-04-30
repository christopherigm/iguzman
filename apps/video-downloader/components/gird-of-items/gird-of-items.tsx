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
import Pinterest from '@mui/icons-material/Pinterest';
import BlockIcon from '@mui/icons-material/Block';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import GridViewIcon from '@mui/icons-material/GridView';
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import SplitscreenIcon from '@mui/icons-material/Splitscreen';
import ErrorIcon from '@mui/icons-material/Error';
import LinearProgress from '@mui/material/LinearProgress';
import { signal } from '@preact-signals/safe-react';
import { PaperCard } from '@repo/ui';
import { InnerSort, DateParser, HourParser } from '@repo/utils';
import Item, { VideoType } from 'classes/item';
import { ReactElement, ReactNode, useEffect, useState } from 'react';
import ReactPlayer from 'react-player';
import copy from 'copy-to-clipboard';
import Link from 'next/link';
import Snackbar from '@mui/material/Snackbar';

type IconColorType = Record<VideoType, string>;
const iconColor: IconColorType = {
  audio: 'red',
  youtube: 'red',
  instagram: '#fbad50',
  facebook: '#1877F2',
  twitter: '#111',
  tiktok: '#111',
  pinterest: 'red',
};

type TikTokProps = {
  sx?: {
    color?: string;
  };
  color?: string;
  fontSize?: 'small' | 'medium' | 'large';
};

const TikTok = ({ sx, color, fontSize = 'medium' }: TikTokProps) => {
  return (
    <svg
      fill={sx?.color || color}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 50 50"
      width={fontSize === 'small' ? 20 : fontSize === 'medium' ? 24 : 28}
      height={fontSize === 'small' ? 20 : fontSize === 'medium' ? 24 : 28}
    >
      <path d="M41,4H9C6.243,4,4,6.243,4,9v32c0,2.757,2.243,5,5,5h32c2.757,0,5-2.243,5-5V9C46,6.243,43.757,4,41,4z M37.006,22.323 c-0.227,0.021-0.457,0.035-0.69,0.035c-2.623,0-4.928-1.349-6.269-3.388c0,5.349,0,11.435,0,11.537c0,4.709-3.818,8.527-8.527,8.527 s-8.527-3.818-8.527-8.527s3.818-8.527,8.527-8.527c0.178,0,0.352,0.016,0.527,0.027v4.202c-0.175-0.021-0.347-0.053-0.527-0.053 c-2.404,0-4.352,1.948-4.352,4.352s1.948,4.352,4.352,4.352s4.527-1.894,4.527-4.298c0-0.095,0.042-19.594,0.042-19.594h4.016 c0.378,3.591,3.277,6.425,6.901,6.685V22.323z" />
    </svg>
  );
};

type GridItemProps = {
  item: Item;
  onDeleteItem: () => void;
  onCancelItem: () => void;
  setOpen: () => void;
  miniMode: boolean;
  devMode: boolean;
  darkMode: boolean;
};

const GridItem = ({
  item,
  onDeleteItem,
  onCancelItem,
  setOpen,
  miniMode,
  devMode,
  darkMode,
}: GridItemProps) => {
  const URLBase = item.URLBase.substring(0, item.URLBase.length - 4);

  const videoLink = item.filename
    ? `${URLBase}/media/${item.filename}`
    : `${URLBase}/media/${item.id}.${item.justAudio ? 'm4a' : 'mp4'}`;

  const actionButtons = (
    <>
      {item.status === 'ready' ||
      item.status === 'error' ||
      item.status === 'canceled' ? (
        <>
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
          <Box marginLeft={0.5} paddingLeft={1} borderLeft="solid 1px #666">
            <IconButton
              aria-label="delete"
              size="small"
              onClick={() => onDeleteItem()}
              color="error"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        </>
      ) : null}
      {item.status === 'downloading' || item.status === 'none' ? (
        <Box marginLeft={0.5} paddingLeft={1} borderLeft="solid 1px #666">
          <IconButton
            aria-label="delete"
            size="small"
            onClick={() => onCancelItem()}
            color="error"
          >
            <BlockIcon fontSize="small" />
          </IconButton>
        </Box>
      ) : null}
      {item.status === 'deleted' ? (
        <Box marginLeft={0.5} paddingLeft={1} borderLeft="solid 1px #666">
          <IconButton
            aria-label="delete"
            size="small"
            onClick={() => onDeleteItem()}
            color="error"
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ) : null}
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
            <Link href={item.url} target="_blank">
              {item.justAudio || item.type === 'audio' ? (
                <AudioIcon
                  fontSize={miniMode ? 'small' : 'medium'}
                  sx={{ color: darkMode ? 'white' : iconColor.audio }}
                />
              ) : item.type === 'youtube' ? (
                <YouTube
                  fontSize={miniMode ? 'small' : 'medium'}
                  sx={{ color: darkMode ? 'white' : iconColor.youtube }}
                />
              ) : item.type === 'instagram' ? (
                <Instagram
                  fontSize={miniMode ? 'small' : 'medium'}
                  sx={{ color: darkMode ? 'white' : iconColor.instagram }}
                />
              ) : item.type === 'facebook' ? (
                <Facebook
                  fontSize={miniMode ? 'small' : 'medium'}
                  sx={{ color: darkMode ? 'white' : iconColor.facebook }}
                />
              ) : item.type === 'twitter' ? (
                <X
                  fontSize={miniMode ? 'small' : 'medium'}
                  sx={{ color: darkMode ? 'white' : iconColor.twitter }}
                />
              ) : item.type === 'tiktok' ? (
                <TikTok
                  fontSize={miniMode ? 'small' : 'medium'}
                  sx={{ color: darkMode ? 'white' : iconColor.tiktok }}
                />
              ) : item.type === 'pinterest' ? (
                <Pinterest
                  fontSize={miniMode ? 'small' : 'medium'}
                  sx={{ color: darkMode ? 'white' : iconColor.pinterest }}
                />
              ) : null}
            </Link>
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
          ) : item.status === 'canceled' ? (
            <>Canceled</>
          ) : item.status === 'deleted' ? (
            <>Video deleted {" :'c"}</>
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
          <Link
            href={item.url}
            target="_blank"
            style={{
              color: darkMode ? 'white' : 'black',
            }}
          >
            URL: {item.url}
          </Link>
        </Typography>

        <Box marginLeft={1} paddingLeft={1} borderLeft="solid 1px #666">
          <IconButton
            aria-label="copy"
            size="small"
            onClick={() => {
              copy(item.url);
              setOpen();
            }}
            color="default"
          >
            <ContentCopyIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>
      {item.status === 'ready' ? (
        <>
          <Box marginTop={1} marginBottom={1}>
            <Divider />
          </Box>
          <Link href={videoLink} download={true}>
            <Box
              display="flex"
              flexDirection="row"
              justifyContent="space-between"
              alignItems="center"
              color={darkMode ? 'white' : 'black'}
            >
              <Typography variant="body2" noWrap={true}>
                Direct video link: {videoLink}
              </Typography>
              <Box marginLeft={1} paddingLeft={1} borderLeft="solid 1px #666">
                <IconButton aria-label="copy" size="small" color="default">
                  <AttachFileIcon fontSize="small" />
                </IconButton>
              </Box>
            </Box>
          </Link>
        </>
      ) : null}

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

type FilterButtonProps = {
  children: ReactNode;
  videoType: VideoType;
  darkMode: boolean;
};

const FilterButton = ({
  children,
  videoType,
  darkMode,
}: FilterButtonProps): ReactElement => {
  const selected = filterTypes.value.indexOf(videoType) > -1;
  const color = selected
    ? darkMode
      ? 'white'
      : iconColor[videoType]
    : darkMode
      ? '#999'
      : '#000';
  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      marginRight={1}
      padding={0.5}
      onClick={() => {
        const index = filterTypes.value.indexOf(videoType);
        if (index > -1) {
          filterTypes.value.splice(index, 1);
          filterTypes.value = [...filterTypes.value];
        } else {
          filterTypes.value.push(videoType);
          filterTypes.value = [...filterTypes.value];
        }
      }}
      sx={{
        cursor: 'pointer',
        opacity: selected ? '1' : '0.7',
        color: color,
        fill: color,
        borderBottom: `2px solid ${selected ? color : 'rgba(0,0,0,0)'}`,
      }}
    >
      {children}
    </Box>
  );
};

type Props = {
  items: Array<Item>;
  onDeleteItem: (id: string) => void;
  devMode: boolean;
  darkMode: boolean;
};

const miniGrid = signal(false);
const itemsToDisplay = signal(6);
const page = signal(1);
const offset = signal(0);
const filterTypes = signal<Array<VideoType>>([]);
const filterByErrors = signal<boolean>(false);
const filteredItems = signal<Array<Item>>([]);

const GridOfItems = ({
  items,
  onDeleteItem,
  devMode,
  darkMode,
}: Props): ReactElement => {
  const [open, setOpen] = useState(false);
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

  useEffect(() => {
    page.value = 1;
    filterTypes.value = [];
  }, [items.length]);

  return (
    <Box display="flex" flexDirection="column">
      <Box display="flex" flexDirection="row" justifyContent="space-between">
        <Box display="flex" flexDirection="row" alignItems="center">
          {items.filter((i) => i.justAudio).length ? (
            <FilterButton videoType="audio" darkMode={darkMode}>
              <AudioIcon />
            </FilterButton>
          ) : null}
          {items.filter((i) => i.type && i.type === 'youtube').length ? (
            <FilterButton videoType="youtube" darkMode={darkMode}>
              <YouTube />
            </FilterButton>
          ) : null}
          {items.filter((i) => i.type && i.type === 'instagram').length ? (
            <FilterButton videoType="instagram" darkMode={darkMode}>
              <Instagram />
            </FilterButton>
          ) : null}
          {items.filter((i) => i.type && i.type === 'tiktok').length ? (
            <FilterButton videoType="tiktok" darkMode={darkMode}>
              <TikTok />
            </FilterButton>
          ) : null}
          {items.filter((i) => i.type && i.type === 'facebook').length ? (
            <FilterButton videoType="facebook" darkMode={darkMode}>
              <Facebook />
            </FilterButton>
          ) : null}
          {items.filter((i) => i.type && i.type === 'twitter').length ? (
            <FilterButton videoType="twitter" darkMode={darkMode}>
              <X />
            </FilterButton>
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
          {items.filter((i) => i.type && i.status === 'error').length ? (
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
          ) : null}
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
                onDeleteItem={() => {
                  i.clearTimeout();
                  onDeleteItem(i.id);
                }}
                onCancelItem={() => {
                  i.cancelRequest();
                  i.clearTimeout();
                }}
                setOpen={() => setOpen(true)}
                miniMode={miniGrid.value}
                devMode={devMode}
                darkMode={darkMode}
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
      <Snackbar
        open={open}
        onClose={() => setOpen(false)}
        autoHideDuration={2000}
        message="Link copied to clipboard"
      />
    </Box>
  );
};

export default GridOfItems;

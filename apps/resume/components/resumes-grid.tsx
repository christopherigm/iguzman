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
import BlockIcon from '@mui/icons-material/Block';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import GridViewIcon from '@mui/icons-material/GridView';
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import SplitscreenIcon from '@mui/icons-material/Splitscreen';
import ErrorIcon from '@mui/icons-material/Error';
import LinearProgress from '@mui/material/LinearProgress';
import { Signal, signal } from '@preact-signals/safe-react';
import { PaperCard } from '@repo/ui';
import { InnerSort, DateParser, HourParser } from '@repo/utils';
// import Item, { VideoType } from 'classes/item';
import { ReactElement, ReactNode, useEffect } from 'react';
import ReactPlayer from 'react-player';
import copy from 'copy-to-clipboard';
import Link from 'next/link';
import User from 'classes/user';
import ResumesGridItem from 'components/resumes-grid-item';

type Props = {
  items: Array<User>;
  onDeleteItem: (id: string) => void;
  devMode: boolean;
  darkMode: boolean;
};

const miniGrid = signal(false);
const itemsToDisplay = signal(6);
const page = signal(1);
const offset = signal(0);
// const filterTypes = signal<Array<VideoType>>([]);
// const filterByErrors = signal<boolean>(false);
const filteredItems = signal<Array<User>>([]);

const ResumesGrid = ({
  items,
  onDeleteItem,
  devMode,
  darkMode,
}: Props): ReactElement => {
  offset.value = (page.value - 1) * itemsToDisplay.value;
  filteredItems.value = items;
  // .filter((i) => {
  //   if (!filterTypes.value.length) {
  //     return i;
  //   }
  //   if (i.type && filterTypes.value.indexOf(i.type) > -1) {
  //     return i;
  //   }
  // })
  // .filter((i) => {
  //   if (!filterByErrors.value) {
  //     return i;
  //   } else if (i.status === 'error') {
  //     return i;
  //   }
  // })
  // .sort(InnerSort('_created', 'desc'));

  useEffect(() => {
    page.value = 1;
    // filterTypes.value = [];
  }, [items.length]);

  return (
    <Grid container columnSpacing={2}>
      {filteredItems.value
        .slice(offset.value, offset.value + itemsToDisplay.value)
        .map((i: User, index: number) => (
          <Grid
            item
            xs={miniGrid.value ? 6 : 12}
            sm={miniGrid.value ? 4 : 6}
            md={miniGrid.value ? 3 : 4}
            key={index}
          >
            <ResumesGridItem user={i} darkMode={darkMode} devMode={devMode} />
          </Grid>
        ))}
    </Grid>
  );
};

export default ResumesGrid;

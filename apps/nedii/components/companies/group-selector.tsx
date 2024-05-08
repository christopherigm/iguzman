import React, { ReactElement } from 'react';
import { Signal, signal } from '@preact-signals/safe-react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
// import CheckCircleIcon from '@mui/icons-material/CheckCircle';
// import { GenericImage, GetIconByName } from '@repo/ui';
import LinearProgress from '@mui/material/LinearProgress';
import Group, { group } from 'classes/group';
import { useEffect } from '@preact-signals/safe-react/react';
import GroupItem from 'components/companies/group-item';

type Props = {
  URLBase: string;
  groupSelectedID: number;
  onSelect: (group: Group) => void;
};

const groups: Signal<Array<Group>> = signal([]);
const isLoading: Signal<boolean> = signal(false);

const GroupSelector = ({
  URLBase,
  groupSelectedID = 0,
  onSelect,
}: Props): ReactElement => {
  useEffect(() => {
    isLoading.value = true;
    group.URLBase = URLBase;
    group
      .getGroups()
      .then((data) => (groups.value = data))
      .catch((e) => console.log('e:', e))
      .finally(() => (isLoading.value = false));
  }, []);

  return (
    <>
      {isLoading.value ? (
        <>
          <Typography variant="body1">Cargadon categorias...</Typography>
          <Grid item xs={12}>
            <Box sx={{ width: '100%' }}>
              <LinearProgress />
            </Box>
          </Grid>
        </>
      ) : (
        <Typography variant="body1">
          Seleccione una categoria para la empresa
        </Typography>
      )}
      <Grid container spacing={2} marginTop={0.5}>
        {groups.value.map((group: Group, index: number) => {
          group.selected = group.id === groupSelectedID;
          return (
            <Grid item xs={12} md={6} lg={4} key={index}>
              <GroupItem
                onClick={() => {
                  groups.value.map((i) => (i.selected = false));
                  group.selected = !group.selected;
                  onSelect(group);
                }}
                group={group}
                selected={group.selected}
              />
            </Grid>
          );
        })}
      </Grid>
    </>
  );
};

export default GroupSelector;

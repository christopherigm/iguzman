import React, { ReactElement } from 'react';
import { Signal, signal } from '@preact-signals/safe-react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
// import CheckCircleIcon from '@mui/icons-material/CheckCircle';
// import { GenericImage, GetIconByName } from '@repo/ui';
import Group, { group } from 'classes/group';
import { useEffect } from '@preact-signals/safe-react/react';
import GroupItem from 'components/companies/group-item';

type Props = {
  URLBase: string;
  onSelect: (g: Group) => void;
};

const groups: Signal<Array<Group>> = signal([]);

const GroupSelector = ({ URLBase, onSelect }: Props): ReactElement => {
  useEffect(() => {
    group.URLBase = URLBase;
    group
      .getGroups()
      .then((data) => {
        console.log(data);
        groups.value = data;
      })
      .catch((e) => console.log('e:', e));
  }, []);

  return (
    <>
      <Typography variant="body1">
        Seleccione 1 o mas categorias para la empresa
      </Typography>
      <Grid container spacing={2} marginTop={0.5}>
        {groups.value.map((group: Group, index: number) => {
          return (
            <Grid item xs={12} md={6} lg={4}>
              <GroupItem
                key={index}
                onClick={() => {
                  console.log('group', group.selected);
                  console.log('groups', groups);
                  group.selected = !group.selected;
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

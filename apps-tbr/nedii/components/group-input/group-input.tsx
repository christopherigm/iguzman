import React, {
  useEffect,
  ReactElement,
  useState,
} from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Divider from '@mui/material/Divider';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import {
  PaperCard,
} from 'ui';
import type {
  ExpoInterface,
  GroupInterface,
} from 'interfaces/stand-interface';
import GetGroups from 'local-utils/get-groups';
import GetExpos from 'local-utils/get-expos';
import GetExposByGroup from 'local-utils/get-expos-by-group';
import CreateGroup from './create-group';
import CreateExpo from './create-expo';
import GroupItem from 'components/group-item';
import ExpoItem from 'components/expo-item';

type Props = {
  URLBase: string;
  onChange: (name: string, value: number) => void;
};

const GroupInput = ({
    URLBase,
    onChange,
  }: Props): ReactElement => {
  const [groups, setGroups] = useState<Array<GroupInterface>>([]);
  const [expos, setExpos] = useState<Array<ExpoInterface>>([]);
  const [exposByGroup, setExposByGroup] = useState<Array<ExpoInterface>>([]);
  const [isLoading, setIsLoading] = useState<Boolean>(false); // remove -> Use Reducer
  const [groupSelected, setGroupSelected] = useState<number | null>(null);
  const [expoSelected, setExpoSelected] = useState<number | null>(null);
  const [createGroup, setCreateGroup] = useState<Boolean>(false);
  const [createExpo, setCreateExpo] = useState<Boolean>(false);

  useEffect(() => {
    if (!groups.length) {
      setIsLoading(true);
      GetGroups({
        URLBase
      })
        .then((data: Array<GroupInterface>) => setGroups(data))
        .catch((e: any) => {})
        .finally(() => setIsLoading(false));
    }
    if (groupSelected) {
      setIsLoading(true);
      GetExposByGroup({
          URLBase,
          groupID: groupSelected,
        })
        .then((data: Array<ExpoInterface>) => setExposByGroup(data))
        .catch((_e: any) => {})
        .finally(() => setIsLoading(false));
    }
    if (!expos.length) {
      setIsLoading(true);
      GetExpos({URLBase})
      .then((data: Array<ExpoInterface>) => setExpos(data))
      .catch((_e: any) => {})
      .finally(() => setIsLoading(false));
    }
  }, [URLBase, expos.length, groupSelected, groups]);

  if (!groups.length && isLoading) {
    return (
      <PaperCard>
        <Box
          display='flex'
          flexDirection='column'
          alignItems='center'>
          <Box marginTop={1}>
            <Typography variant='body1'>
              Cargando categorias...
            </Typography>
          </Box>
          <Box marginTop={2} marginBottom={2}>
            <CircularProgress />
          </Box>
        </Box>
      </PaperCard>
    );
  }

  if (!groups.length && !isLoading) {
    return (
      <PaperCard>
        <Box
          display='flex'
          flexDirection='row'
          justifyContent='space-between'
          alignItems='center'>
          <Typography variant='body1' textAlign='center'>
            No hay categorias disponibles
          </Typography>
          <Button
            variant='contained'
            type='submit'
            size='small'
            disabled={isLoading}
            onClick={() => setCreateGroup(true)}>
            Crear nueva categoria
          </Button>
        </Box>
      </PaperCard>
    );
  }

  if (createGroup && !isLoading) {
    return <CreateGroup
      URLBase={URLBase}
      expos={expos}
      onSuccess={() => {
        setGroupSelected(null);
        setExpoSelected(null);
        setGroups([]);
        setExpos([]);
        setCreateGroup(false);
      }}
      onCancel={() => setCreateGroup(false)}
      onCreateExpo={() => {
        setCreateGroup(false);
        setCreateExpo(true);
      }} />
  }

  if (createExpo && !isLoading) {
    return <CreateExpo
      URLBase={URLBase}
      onSuccess={() => {
        setGroupSelected(null);
        setExpoSelected(null);
        setGroups([]);
        setExpos([]);
        setCreateExpo(false);
      }}
      onCancel={() => setCreateExpo(false)}
      groups={groups} />
  }
  
  return (
    <PaperCard>
      <Box
        display='flex'
        flexDirection='row'
        justifyContent='space-between'
        alignItems='center'>
        <Typography variant='body1' fontWeight={600}>
          Selecciona una Categoria para tu empresa
        </Typography>
        <Button
          variant='contained'
          type='submit'
          size='small'
          onClick={() => setCreateGroup(true)}>
          Crear categoria
        </Button>
      </Box>
      <Box marginTop={2} marginBottom={2}>
        <Divider />
      </Box>
      <Grid
        container
        rowSpacing={2}
        columnSpacing={2}>
        {
          groups.map((i: GroupInterface, index: number) => {
            return (
              <Grid item xs={6} sm={4} md={3} key={index}>
                <GroupItem
                  onClick={() => {
                    if (isLoading ) {
                      return;
                    }
                    setExposByGroup([]);
                    setExpoSelected(null);
                    setGroupSelected(v => v===i.id ? null : i.id);
                  }}
                  selected={groupSelected === i.id}
                  group={i} />
              </Grid>
            );
          })
        }
      </Grid>
      {
        groupSelected && !exposByGroup.length && isLoading ?
        <>
          <Box marginTop={2} marginBottom={2}>
            <Divider />
          </Box>
          <Box
            display='flex'
            flexDirection='column'
            alignItems='center'>
            <Box marginTop={1}>
              <Typography variant='body1'>
                Cargando expos de esta categoria...
              </Typography>
            </Box>
            <Box marginTop={2} marginBottom={2}>
              <CircularProgress />
            </Box>
          </Box>
        </> : null
      }
      {
        groupSelected && !exposByGroup.length && !isLoading ?
        <>
          <Box marginTop={2} marginBottom={2}>
            <Divider />
          </Box>
          <Box
            display='flex'
            flexDirection='column'
            alignItems='center'>
            <Box marginTop={1}>
              <Typography variant='body1'>
                No se encontraron expos para esta categoria.
              </Typography>
            </Box>
            <Box marginTop={2} marginBottom={2}>
              <Button
                variant='contained'
                type='submit'
                size='small'
                onClick={() => {
                  setCreateExpo(true);
                  setCreateGroup(false);
                }}>
                Crear expo
              </Button>
            </Box>
          </Box>
        </> : null
      }
      {
        groupSelected && exposByGroup.length ?
        <>
          <Box marginTop={2} marginBottom={2}>
            <Divider />
          </Box>
          <Box
            display='flex'
            flexDirection='row'
            justifyContent='space-between'
            alignItems='center'
            marginTop={2}>
            <Typography variant='body1' fontWeight={600}>
              Selecciona la Expo a la cual pertenece tu empresa.
            </Typography>
            <Button
              variant='contained'
              type='submit'
              size='small'
              onClick={() => {
                setCreateExpo(true);
                setCreateGroup(false);
              }}>
              Crear expo
            </Button>
          </Box>
          <Box marginTop={2} marginBottom={2}>
            <Divider />
          </Box>
          <Grid
            container
            rowSpacing={2}
            columnSpacing={2}>
            {
              exposByGroup.map((i: ExpoInterface, index: number) => {
                return (
                  <Grid item xs={6} sm={4} md={3} key={index}>
                    <ExpoItem
                      selected={expoSelected === i.id}
                      onClick={() => {
                        if (isLoading) {
                          return;
                        }
                        setExpoSelected(i.id);
                        onChange('expo', i.id);
                      }}
                      expo={i} />
                  </Grid>
                );
              })
            }
          </Grid>
        </> : null
      }
    </PaperCard>
  );
};

export default GroupInput;

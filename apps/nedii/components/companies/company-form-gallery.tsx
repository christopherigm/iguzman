import { ReactElement, FormEvent, useEffect } from 'react';
import { user } from 'classes/user';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import { Signal, signal } from '@preact-signals/safe-react';
import Divider from '@mui/material/Divider';
import Stand from 'classes/stand';
import { GenericImageInput } from '@repo/ui';
import Avatar from '@mui/material/Avatar';
import StandPicture from 'classes/stand/stand-picture';

const isLoadingLocal: Signal<boolean> = signal(false);
const complete: Signal<boolean> = signal(false);
const error: Signal<string> = signal('');

type Props = {
  isLoading: boolean;
  darkMode: boolean;
  URLBase: string;
  stand: Stand;
  onCancel: () => void;
  onIncomplete: () => void;
  onComplete: () => void;
};

const CompanyFormGallery = ({
  isLoading = false,
  darkMode = false,
  URLBase,
  stand,
  onCancel,
  onIncomplete,
  onComplete,
}: Props): ReactElement => {
  useEffect(() => {
    console.log('CompanyFormGallery.tsx > renders');
    isLoadingLocal.value = false;
    complete.value = false;
    error.value = '';
    user.getNediiUserFromLocalStorage();
    user.URLBase = URLBase;
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    isLoadingLocal.value = true;
    complete.value = false;
    error.value = '';
  };

  const checkCompleteness = (): void => {
    if (stand.attributes.img_logo && stand.attributes.img_cover) {
      onComplete();
    } else {
      onIncomplete();
    }
  };

  return (
    <Box
      component="form"
      noValidate={false}
      autoComplete="on"
      onSubmit={(e: FormEvent) => onSubmit(e)}
    >
      <Typography variant="body1">Imagenes de la empresa</Typography>
      <Grid container marginTop={0} columnSpacing={2} rowSpacing={2}>
        <Grid item xs={12}>
          <Box width={200} margin="0 auto">
            <GenericImageInput
              label="Logo de la empresa"
              language="es"
              onChange={(img: string) => {
                stand.attributes.img_logo = img;
                checkCompleteness();
              }}
              height={200}
              width="100%"
              defaultValue={stand.attributes.img_logo}
            />
          </Box>
        </Grid>
        <Grid item xs={12}>
          <Box width="100%" margin="0 auto">
            <GenericImageInput
              label="Imagen de portada / encabezado"
              language="es"
              onChange={(img: string) => {
                stand.attributes.img_cover = img;
                checkCompleteness();
              }}
              height={250}
              width="100%"
              defaultValue={stand.attributes.img_cover}
            />
          </Box>
        </Grid>

        {stand.id ? (
          <>
            <Grid item xs={12}>
              <Box marginTop={3} marginBottom={2}>
                <Divider />
              </Box>
              <Typography variant="body1">
                Galeria de imagenes de la empresa (opcional)
              </Typography>
            </Grid>

            <Grid item xs={12}>
              <Grid container columnSpacing={2} rowSpacing={2}>
                <Grid item xs={6} sm={4} md={3}>
                  <GenericImageInput
                    label={
                      isLoading || isLoadingLocal.value
                        ? 'Agregando imagen...'
                        : 'Agregar foto a galeria'
                    }
                    language="es"
                    isLoading={isLoading || isLoadingLocal.value}
                    onChange={(img: string) => {
                      isLoadingLocal.value = true;
                      const newPicture = new StandPicture();
                      newPicture.URLBase = URLBase;
                      newPicture.access = user.access;
                      newPicture.attributes.img_picture = img;
                      newPicture.relationships.stand.data.id = stand.id;
                      newPicture
                        .save()
                        .then(() => {
                          stand.relationships.pictures.data.push(newPicture);
                          stand.relationships.pictures = {
                            ...stand.relationships.pictures,
                          };
                        })
                        .then(() => stand.save())
                        .catch((e) => {})
                        .finally(() => (isLoadingLocal.value = false));
                    }}
                    height={190}
                    width="100%"
                    defaultValue="/images/add_image.png"
                    labelPosition="bottom"
                    cleanAfterLoadImage={true}
                    hideInstructions={true}
                  />
                </Grid>
                {stand.relationships.pictures.data.map(
                  (i: StandPicture, index: number) => {
                    return (
                      <Grid item xs={6} sm={4} md={3} key={index}>
                        <Box display="flex" flexDirection="column">
                          <Avatar
                            alt=""
                            src={i.attributes.img_picture}
                            variant="rounded"
                            sx={{
                              width: '100%',
                              height: 190,
                              boxShadow: '1px 1px 5px rgba(0,0,0,0.5)',
                            }}
                          />
                          <Button
                            variant="contained"
                            size="small"
                            disabled={isLoading || isLoadingLocal.value}
                            onClick={() => {
                              isLoadingLocal.value = true;
                              const index =
                                stand.relationships.pictures.data.indexOf(i);
                              stand.relationships.pictures.data.splice(
                                index,
                                1
                              );
                              stand.relationships.pictures = {
                                ...stand.relationships.pictures,
                              };
                              stand
                                .save()
                                .catch((e) => console.log('Error rem pic:', e))
                                .finally(() => (isLoadingLocal.value = false));
                            }}
                            color="error"
                            sx={{ textTransform: 'initial' }}
                          >
                            Eliminar foto
                          </Button>
                        </Box>
                      </Grid>
                    );
                  }
                )}
              </Grid>
            </Grid>
          </>
        ) : null}
      </Grid>
    </Box>
  );
};

export default CompanyFormGallery;

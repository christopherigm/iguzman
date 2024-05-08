import { ReactElement, FormEvent, useEffect } from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import { Signal, signal } from '@preact-signals/safe-react';
import Divider from '@mui/material/Divider';
import Stand from 'classes/stand';

const isLoading: Signal<boolean> = signal(false);
const complete: Signal<boolean> = signal(false);
const error: Signal<string> = signal('');

type Props = {
  darkMode: boolean;
  URLBase: string;
  stand: Stand;
  onCancel: () => void;
  onIncomplete: () => void;
  onComplete: () => void;
};

const CompanyFormBasicInfo = ({
  darkMode = false,
  URLBase,
  stand,
  onCancel,
  onIncomplete,
  onComplete,
}: Props): ReactElement => {
  useEffect(() => {
    console.log('CompanyFormBasicInfo.tsx > renders');
    isLoading.value = false;
    complete.value = false;
    error.value = '';
  }, []);

  const canSubmit = (): boolean => {
    return true;
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    isLoading.value = true;
    complete.value = false;
    error.value = '';
  };

  const checkCompleteness = (): void => {
    if (
      stand.attributes.name &&
      stand.attributes.slogan &&
      stand.attributes.description &&
      stand.attributes.short_description
    ) {
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
      <Typography variant="body1">Informacion de la empresa</Typography>
      <Grid container marginTop={0} columnSpacing={2} rowSpacing={2}>
        <Grid item xs={12} sm={6}>
          <TextField
            label="Nombre de la empresa"
            variant="outlined"
            size="small"
            type="text"
            value={stand.attributes.name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              stand.attributes.name = e.target.value;
              checkCompleteness();
            }}
            disabled={isLoading.value}
            style={{ width: '100%' }}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            label="Slogan de la empresa"
            variant="outlined"
            size="small"
            type="text"
            name="slogan"
            value={stand.attributes.slogan}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              stand.attributes.slogan = e.target.value;
              checkCompleteness();
            }}
            disabled={isLoading.value}
            style={{ width: '100%' }}
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            label="Descripcion larga de la empresa"
            variant="outlined"
            size="small"
            type="text"
            multiline={true}
            rows={4}
            name="description"
            value={stand.attributes.description}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              stand.attributes.description = e.target.value;
              checkCompleteness();
            }}
            disabled={isLoading.value}
            style={{ width: '100%' }}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            label="Descripcion corta de la empresa"
            variant="outlined"
            size="small"
            type="text"
            name="short-description"
            value={stand.attributes.short_description}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              stand.attributes.short_description = e.target.value;
              checkCompleteness();
            }}
            disabled={isLoading.value}
            style={{ width: '100%' }}
          />
        </Grid>

        <Grid item xs={12}>
          <Box marginTop={3} marginBottom={2}>
            <Divider />
          </Box>
          <Typography variant="body1">
            Informacion de redes sociales (opcional)
          </Typography>
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            label="Pagina web"
            variant="outlined"
            size="small"
            type="url"
            name="webpage"
            value={stand.attributes.web_link}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              stand.attributes.web_link = e.target.value;
            }}
            disabled={isLoading.value}
            style={{ width: '100%' }}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            label="Facebook"
            variant="outlined"
            size="small"
            type="url"
            name="facebook"
            value={stand.attributes.facebook_link}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              stand.attributes.facebook_link = e.target.value;
            }}
            disabled={isLoading.value}
            style={{ width: '100%' }}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            label="Twitter"
            variant="outlined"
            size="small"
            type="url"
            name="twitter"
            value={stand.attributes.twitter_link}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              stand.attributes.twitter_link = e.target.value;
            }}
            disabled={isLoading.value}
            style={{ width: '100%' }}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            label="Instagram"
            variant="outlined"
            size="small"
            type="url"
            name="instagram"
            value={stand.attributes.instagram_link}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              stand.attributes.instagram_link = e.target.value;
            }}
            disabled={isLoading.value}
            style={{ width: '100%' }}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            label="LinkedIn"
            variant="outlined"
            size="small"
            type="url"
            name="linkedin"
            value={stand.attributes.linkedin_link}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              stand.attributes.linkedin_link = e.target.value;
            }}
            disabled={isLoading.value}
            style={{ width: '100%' }}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            label="Google"
            variant="outlined"
            size="small"
            type="url"
            name="google"
            value={stand.attributes.google_link}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              stand.attributes.google_link = e.target.value;
            }}
            disabled={isLoading.value}
            style={{ width: '100%' }}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            label="YouTube"
            variant="outlined"
            size="small"
            type="url"
            name="youtube"
            value={stand.attributes.youtube_link}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              stand.attributes.youtube_link = e.target.value;
            }}
            disabled={isLoading.value}
            style={{ width: '100%' }}
          />
        </Grid>

        <Grid item xs={12}>
          <Box marginTop={3} marginBottom={2}>
            <Divider />
          </Box>
          <Typography variant="body1">
            Informacion adicional (opcional)
          </Typography>
        </Grid>

        <Grid item xs={12}>
          <TextField
            label="Acerca de la empresa"
            variant="outlined"
            size="small"
            type="text"
            name="about"
            multiline={true}
            rows={4}
            value={stand.attributes.about}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              (stand.attributes.about = e.target.value)
            }
            disabled={isLoading.value}
            style={{ width: '100%' }}
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            label="Mision de la empresa"
            variant="outlined"
            size="small"
            type="text"
            name="about"
            multiline={true}
            rows={4}
            value={stand.attributes.mission}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              (stand.attributes.mission = e.target.value)
            }
            disabled={isLoading.value}
            style={{ width: '100%' }}
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            label="Vision de la empresa"
            variant="outlined"
            size="small"
            type="text"
            name="about"
            multiline={true}
            rows={4}
            value={stand.attributes.vision}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              (stand.attributes.vision = e.target.value)
            }
            disabled={isLoading.value}
            style={{ width: '100%' }}
          />
        </Grid>
      </Grid>
    </Box>
  );
};

export default CompanyFormBasicInfo;

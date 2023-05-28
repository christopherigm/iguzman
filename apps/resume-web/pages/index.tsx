import {
  useState,
  ReactElement
} from 'react';
import Head from 'next/head';
import MainLayout from 'layouts/main-layout';
import {
  GetUserFromCookie,
  GetCookieCachedValues,
  GetEnvVariables
} from 'utils';
import type {
  EnvironmentVariables,
  CachedValues,
  Languages
} from 'utils';
import type System from 'interfaces/system-interface';
import type UserInterface from 'interfaces/user-interface';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardMedia from '@mui/material/CardMedia';
import CardContent from '@mui/material/CardContent';
import GetMainPageUsers from 'local-utils/get-main-page-users';
import Typography from '@mui/material/Typography';

type ItemProps = {
  username: string;
  first_name: string;
  last_name: string;
  open_to_work: boolean;
  listening_offers: boolean;
  headline: string;
  img_picture: string;
  img_hero_picture: string;
}

const Item = (props: ItemProps): ReactElement => {
  const fullName = `${props.first_name} ${props.last_name}`;
  return (
    <Grid item xs={12} md={4} lg={3}>
      <Card sx={{ minWidth: 275 }} elevation={3}>
        <CardMedia
            sx={{ height: 140 }}
            image={props.img_hero_picture}
            title={fullName} />
        <CardContent>
          
          <Typography gutterBottom variant='body2' align='center' classes=''>
            {fullName}
          </Typography>
          
        </CardContent>
      </Card>
    </Grid>
  )
};

const Page = (props: System): ReactElement => {
  const [system, updateSystem] = useState<System>(props);
  const setSystem = (s: System): void => updateSystem(_s => s);

  return (
    <MainLayout
      system={system}
      setSystem={setSystem}>
      <Head>
        <title>My Resume</title>
      </Head>
      <p>
        {
          props.user ? <>Hello {props.user.attributes.username}</> :
          <>Home. {system.darkMode ? ' - dark' : ' - clear'}</>
        }
      </p>
      <p>Language: {system.language}</p>
      <Grid container spacing={2}>
        {
          system.users.map(i => {
            return (
              <Item
                username={i.attributes.username}
                first_name={i.attributes.first_name}
                last_name={i.attributes.last_name}
                open_to_work={i.attributes.open_to_work}
                listening_offers={i.attributes.listening_offers}
                headline={i.attributes.headline}
                img_picture={i.attributes.img_picture}
                img_hero_picture={i.attributes.img_hero_picture} />
            );
          })
        }
      </Grid>
    </MainLayout>
  );
};

export async function getServerSideProps({ req }: any) {
  const cookies = req.cookies;
  const env = GetEnvVariables() as EnvironmentVariables;
  const user = await GetUserFromCookie(cookies) as UserInterface;
  const cachedValues: CachedValues = GetCookieCachedValues(cookies);
  const users = await GetMainPageUsers({URLBase: env.URLBase}) as Array<UserInterface> || [];
  const props: System = {
    ...env,
    ...cachedValues,
    language: cachedValues.language ? cachedValues.language : env.defaultLanguage as Languages,
    favorites: [],
    cart: [],
    user,
    users
  };
  return {props};
};

export default Page;

import {
  useState,
  ReactElement,
  useEffect
} from 'react';
import Head from 'next/head';
import MainLayout from 'layouts/main-layout';
import Button from '@mui/material/Button';
import Link from 'next/link';
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

const Menus = (): ReactElement => {
  return (
    <Link href='/' passHref>
      <Button color='secondary'>Home</Button>
    </Link>
  );
};

const Page = (props: System): ReactElement => {
  const [system, updateSystem] = useState<System>(props);

  const setSystem = (s: System): void => {
    updateSystem(_s => s);
  };

  return (
    <MainLayout
      system={system}
      setSystem={setSystem}
      menus={Menus()}>
      <Head>Home</Head>
      <p>
        {
          props.user ? <>Hello {props.user.attributes.username}</> :
          <>Home. {system.darkMode ? ' - dark' : ' - clear'}</>
        }
      </p>
      <p>Language: {system.language}</p>
    </MainLayout>
  );
};

export async function getServerSideProps({ req }: any) {
  const cookies = req.cookies;
  const env = GetEnvVariables() as EnvironmentVariables;
  const user = await GetUserFromCookie(cookies) as UserInterface;
  const cachedValues: CachedValues = GetCookieCachedValues(cookies);
  const props: System = {
    ...env,
    ...cachedValues,
    language: cachedValues.language ?? env.defaultLanguage as Languages,
    favorites: [],
    cart: [],
    user
  };
  return {props};
};

export default Page;

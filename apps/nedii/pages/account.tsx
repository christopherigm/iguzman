import React, {
  ReactElement,
  useState,
  FormEvent,
  useReducer,
  useEffect,
} from 'react';
import Head from 'next/head';
import {
  API,
  GetCookieCachedValues,
  GetEnvVariables,
  APICreationErrorHandler,
  GetLocalStorageData,
} from 'utils';
import type {
  EnvironmentVariables,
  CachedValues,
  Languages,
  APIPostCreationError,
  Action,
} from 'utils';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Container from '@mui/material/Container';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Link from 'next/link';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import LinearProgress from '@mui/material/LinearProgress';
import MainLayout from 'layouts/main-layout';
import {SystemInitalState} from 'interfaces/system-interface';
import type System from 'interfaces/system-interface';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import ContactMailIcon from '@mui/icons-material/ContactMail';
import FavoriteIcon from '@mui/icons-material/Favorite';
import StoreIcon from '@mui/icons-material/Store';
import PaymentIcon from '@mui/icons-material/Payment';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import {
  ResetPasswordForm,
  AccountTopMenu,
} from 'ui';
import type UserInterface from 'interfaces/user-interface';

// import AccountTopMenu from 'components/account-top-menu';
import AccountEditorForm from 'components/account-editor-form';

type State = {
  success: boolean;
  isLoading: boolean;
  username: string;
  error: Array<APIPostCreationError>;
};

const InitialState: State = {
  success: false,
  isLoading: false,
  username: '',
  error: []
};

const Reducer = (state: State = InitialState, action: Action): State => {
  if (action.type === 'loading') {
    return {
      ...state,
      success: false,
      isLoading: true,
      error: [],
    };
  } else if (action.type === 'success') {
    return {
      ...state,
      success: true,
      username: '',
      error: [],
      isLoading: false,
    };
  } else if (action.type === 'error' && action.error) {
    return {
      ...state,
      success: false,
      error: APICreationErrorHandler(action.error),
      isLoading: false,
    };
  } else if (action.type === 'input' && action.name) {
    return {
      ...state,
      [action.name]: action.value
    };
  }
  throw new Error('Invalid action');
};


const Page = (props: System): ReactElement => {
  const [system, updateSystem] = useState<System>(props);
  const setSystem = (s: System): void => updateSystem(_s => s);
  const [state, dispatch] = useReducer(Reducer, InitialState);
  const [menu, setMenu] = useState([
    {
      id: 0,
      label: 'Cuenta',
      icon: <AccountCircleIcon />,
      selected: true,
    },
    {
      id: 1,
      label: 'Carrito',
      icon: <ShoppingCartIcon />,
      selected: false,
    },
    {
      id: 2,
      label: 'Favoritos',
      icon: <FavoriteIcon />,
      selected: false,
    },
    {
      id: 3,
      label: 'Empresas',
      icon: <StoreIcon />,
      selected: false,
    },
  ]);

  useEffect(() => {
    const user = GetLocalStorageData('user');
    if (user) {
      setSystem({
        ...system,
        user: JSON.parse(user) as UserInterface
      });
    }
  }, []);

  const setIsLoading = (): void => setSystem({
    ...system,
    isLoading: true
  });

  const menuCallback = (id: number) => {
    const m = [...menu];
    m.map((i: any) => i.selected=false);
    m[id].selected=true;
    setMenu(_p => m);
  };

  return (
    <MainLayout
      system={system}
      setSystem={setSystem}>
      <Head>
        <link rel='icon' href='/favicon.ico' />
        <meta
          name='description'
          content='Learn how to build a personal website using Next.js'
        />
        <title>Nedii</title>
        <meta name='og:title' content={'siteTitle'} />
        <meta name='twitter:card' content='summary_large_image' />
      </Head>
      <Typography
        marginTop={3}
        variant='h5'
        color={system.darkMode ? 'primary.contrastText' : ''}>
        Hola {system.user?.attributes.first_name}!
      </Typography>
      <AccountTopMenu darkMode={system.darkMode} menu={menu} menuCallback={menuCallback} />
      {
        menu.map(({id, selected}) => {
          return (
            <div key={id}>
              {
                id === 0 && selected ?
                  <AccountEditorForm
                    URLBase={system.URLBase}
                    darkMode={system.darkMode} /> : null
              }
            </div>
          )
        })
      }
    </MainLayout>
  );
};

export async function getServerSideProps({ req }: any) {
  const cookies = req.cookies;
  const env = GetEnvVariables() as EnvironmentVariables;
  const cachedValues: CachedValues = GetCookieCachedValues(cookies);
  const props: System = {
    ...SystemInitalState,
    ...env,
    ...cachedValues,
    language: cachedValues.language ? cachedValues.language : env.defaultLanguage as Languages,
  };
  return {props};
};

export default Page;

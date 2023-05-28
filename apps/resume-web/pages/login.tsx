import {
  useState,
  useEffect,
  useReducer,
  FormEvent,
  ReactElement
} from 'react';
import Head from 'next/head';
import MainLayout from 'layouts/main-layout';
import type {
  JWTPayload,
  EnvironmentVariables,
  CachedValues,
  Languages
} from 'utils';
import {
  API,
  GetUserFromCookie,
  GetCookieCachedValues,
  GetEnvVariables,
  CommonLoginReducer,
  CommonLoginInitialState,
  SaveCookie
} from 'utils';
import {LoginForm} from 'ui';
import type System from 'interfaces/system-interface';
import type UserInterface from 'interfaces/user-interface';

const Login = (props: System): ReactElement => {
  const [system, updateSystem] = useState<System>(props);
  const [state, dispatch] = useReducer(CommonLoginReducer, CommonLoginInitialState);

  const setSystem = (s: System): void => {
    updateSystem(_s => s);
  };

  useEffect(() => {
    if (system.user) {
      return window.location.replace('/');
    }
  }, [system.user]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    dispatch({type: 'login'});
    API.Login({
        URLBase: system.URLBase,
        attributes: {
          username: state.username,
          password: state.password
        }
      })
        .then((data: JWTPayload) => {
          SaveCookie('jwt', data.access);
          dispatch({type: 'success'});
          window.location.replace('/');
        })
        .catch((error) => {
          console.log('Error>', error);
          dispatch({
            type: 'error',
            error: error
          });
        });
  };

  if (system.user) return (
    <MainLayout system={system} setSystem={setSystem}>
      <Head>
        <title>Login</title>
      </Head>
      <p>Redirecting...</p>
    </MainLayout>
  );

  return (
    <MainLayout system={system} setSystem={setSystem}>
      <Head>
        <title>Login</title>
      </Head>
      <p>Login</p>
      <LoginForm
        handleSubmit={handleSubmit}
        state={state}
        dispatch={dispatch} />
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

export default Login;

import { ReactElement } from 'react';
import Head from 'next/head';
import MainLayout from 'layouts/main-layout';
import {
  SystemProvider,
  SystemInitalState
} from 'utils';
import type {SystemInterface} from 'utils';

const Login = (system: SystemInterface): ReactElement => {
  return (
    <SystemProvider system={system}>
      <MainLayout>
        <Head>
          <title>Home</title>
        </Head>
        <p>Sign Up</p>
      </MainLayout>
    </SystemProvider>
  );
};

export async function getServerSideProps({ req }: any) {
  const cookies = req.cookies;
  const system = cookies.system ? JSON.parse(cookies.system) : SystemInitalState;
  return { props: system};
};

export default Login;

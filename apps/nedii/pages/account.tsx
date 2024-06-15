import React, { ReactElement, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Typography from '@mui/material/Typography';
import { AccountTopMenu, MainLayout } from '@repo/ui';
import type { TopMenuItem } from '@repo/ui';
import System, { system } from 'classes/system';
import { user } from 'classes/user';
import AccountTopMenuItems from 'components/account-top-menu-items';
import AccountEditor from 'components/account-editor';

const menu = AccountTopMenuItems;

const Page = (props: any): ReactElement => {
  const router = useRouter();

  useEffect(() => {
    const path = router.pathname.replace(/\//g, '');
    menu.value.forEach((i) =>
      i.href === path ? (i.selected = true) : (i.selected = false)
    );
    menu.value = [...menu.value];
    system.setDataFromPlainObject(props);
    user.setDataFromLocalStorage();
    if (!user.id) {
      router.push('/');
    }
  }, [props, router]);

  return (
    <MainLayout
      darkMode={system.darkMode}
      switchTheme={() => system.switchTheme()}
      devMode={system.devMode}
      switchDevMode={() => system.switchDevMode()}
      isLoading={system.isLoading}
      language={props.defaultLanguage}
      user={{
        firstname: user.attributes.first_name,
        lastname: user.attributes.last_name,
        username: user.attributes.username,
        img_picture: user.attributes.img_picture,
      }}
      loginEnabled={props.loginEnabled}
      version={props.version}
      logo={system.logo}
      hostName={props.hostName}
    >
      <Head>
        <link rel="icon" href="/favicon.ico" />
        <meta
          name="description"
          content="Learn how to build a personal website using Next.js"
        />
        <title>Nedii</title>
        <meta name="og:title" content={'siteTitle'} />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      {user.id ? (
        <Typography
          marginTop={3}
          variant="h5"
          color={system.darkMode ? 'primary.contrastText' : ''}
        >
          Hola {user.attributes.first_name}!
        </Typography>
      ) : null}
      <AccountTopMenu
        darkMode={system.darkMode}
        menu={menu.value}
        menuCallback={(id: number) => {
          menu.value.map((i: TopMenuItem) =>
            i.id === id ? (i.selected = true) : (i.selected = false)
          );
          menu.value = [...menu.value];
        }}
      />
      <AccountEditor URLBase={props.URLBase} darkMode={system.darkMode} />
    </MainLayout>
  );
};

export async function getServerSideProps({ req }: any) {
  const system = System.getInstance();
  system.parseCookies(req.cookies);
  return { props: system.getPlainObject() };
}

export default Page;

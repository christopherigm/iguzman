import React, { ReactElement, useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Typography from '@mui/material/Typography';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import FavoriteIcon from '@mui/icons-material/Favorite';
import StoreIcon from '@mui/icons-material/Store';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import { AccountTopMenu, MainLayout } from 'ui';
import AccountEditor from 'components/account-editor';
import Companies from 'components/companies';
import System, { system } from 'classes/system';
import { user } from 'classes/user';

const Page = (props: any): ReactElement => {
  const router = useRouter();
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
    system.setServerSideProps(props);
    user.getNediiUserFromLocalStorage();
    if (!user.id) {
      router.push('/');
    }
  }, [props, router]);

  const menuCallback = (id: number) => {
    const m = [...menu];
    m.map((i: any) => (i.selected = false));
    m[id].selected = true;
    setMenu((_p) => m);
  };

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
          Hola{user.attributes.first_name}!
        </Typography>
      ) : null}
      <AccountTopMenu
        darkMode={system.darkMode}
        menu={menu}
        menuCallback={menuCallback}
      />
      {menu.map(({ id, selected }) => {
        return (
          <div key={id}>
            {id === 0 && selected ? (
              <AccountEditor
                URLBase={props.URLBase}
                darkMode={system.darkMode}
                isLoading={system.isLoading}
                switchLoading={(v: boolean) => system.switchLoading(v)}
              />
            ) : id === 3 && selected ? (
              <Companies
                URLBase={props.URLBase}
                language={props.language}
                darkMode={system.darkMode}
              />
            ) : null}
          </div>
        );
      })}
    </MainLayout>
  );
};

export async function getServerSideProps({ req }: any) {
  const props = System.getInstance();
  props.parseCookies(req.cookies);
  return { props: props.getServerSideProps() };
}

export default Page;

'use client';

import { ReactElement } from 'react';
import { Button, Footer } from '@repo/ui';
import styles from './page.module.css';

const Test = (): ReactElement => {
  return (
    <>
      <Button appName="web" className={styles.button} callBack={() => {}}>
        Click me!
      </Button>
      <Footer
        version="1.0"
        darkMode={false}
        switchTheme={() => {}}
        devMode={false}
        switchDevMode={() => {}}
        hostName="local"
      />
    </>
  );
};

export default Test;

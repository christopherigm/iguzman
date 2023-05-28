import 'styles/globals.scss';
import '@fontsource/roboto';

type Props = {
  Component: any,
  pageProps: any
}

export default function App({ Component, pageProps }: Props) {
  return <Component {...pageProps} />;
};

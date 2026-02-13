import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ThemeSwitch } from '@repo/ui/theme-switch';
import { Switch } from '@repo/ui/core-elements/switch';
import { Icon } from '@repo/ui/core-elements/icon';
import { Box } from '@repo/ui/core-elements/box';
import Button from '@repo/ui/core-elements/button';
import { add } from '@repo/helpers/add';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function Home({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('HomePage');

  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="center"
      styles={{
        minHeight: '100vh',
      }}
    >
      <Box
        width={360}
        padding={32}
        borderRadius={12}
        flexDirection="column"
        alignItems="center"
      >
        <h2
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: 'var(--foreground)',
            margin: 0,
          }}
        >
          {t('themeMode')} {add(2, 3)}
        </h2>
        <ThemeSwitch />
        <Switch />
        <Icon
          icon="/icons/cloud-rain-alt-svgrepo-com.svg"
          size={50}
          padding={5}
          backgroundColor="var(--surface-2)"
          backgroundShape="circle"
        />
        <Box
          marginTop={20}
          width="100%"
          elevation={5}
          borderRadius={8}
          padding={10}
        >
          {t('content')}
          <Button text={t('goToDocs')} />
        </Box>
      </Box>
    </Box>
  );
}

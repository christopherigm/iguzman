import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ThemeSwitch } from '@repo/ui/theme-switch';
import { Switch } from '@repo/ui/core-elements/switch';
import { Icon } from '@repo/ui/core-elements/icon';
import { Box } from '@repo/ui/core-elements/box';
import Button from '@repo/ui/core-elements/button';
import { add } from '@repo/helpers/add';
import { Grid } from '@repo/ui/core-elements/grid';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Container } from '@repo/ui/core-elements/container';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function Home({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('HomePage');
  const tCommon = await getTranslations('Common');

  return (
    <Container
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
          elevation={3}
          borderRadius={8}
          padding={10}
        >
          {t('content')} {t('goToAbout')}
          <Button text={tCommon('save')} />
        </Box>
        <Grid spacing={1} marginTop={10} container>
          <Grid item size={{ xs: 4 }}>
            <Box
              padding={20}
              backgroundColor="var(--surface-2)"
              borderRadius={8}
            >
              Left Column
            </Box>
          </Grid>
          <Grid item size={{ xs: 4 }}>
            <Box
              padding={20}
              backgroundColor="var(--surface-1)"
              borderRadius={8}
            >
              Center
            </Box>
          </Grid>
          <Grid item size={{ xs: 4 }}>
            <Box
              padding={20}
              backgroundColor="var(--surface-2)"
              borderRadius={8}
            >
              Right Column
            </Box>
          </Grid>
          <Grid item size={{ xs: 4 }}>
            <Box
              padding={20}
              backgroundColor="var(--surface-2)"
              borderRadius={8}
            >
              4th Column
            </Box>
          </Grid>
          <Grid item size={{ xs: 4 }}>
            <Box
              padding={20}
              backgroundColor="var(--surface-2)"
              borderRadius={8}
            >
              sss
            </Box>
          </Grid>
        </Grid>
        <TextInput name="name" lable="My input" multirow rows={5} />
      </Box>
    </Container>
  );
}

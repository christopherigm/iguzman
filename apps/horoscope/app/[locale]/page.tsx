import { setRequestLocale } from 'next-intl/server';
import { ThemeSwitch } from '@repo/ui/theme-switch';
import { Switch } from '@repo/ui/core-elements/switch';
import { Box } from '@repo/ui/core-elements/box';
import { Container } from '@repo/ui/core-elements/container';
import { Grid } from '@repo/ui/core-elements/grid';
import Button from '@repo/ui/core-elements/button';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function Home({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const features = [
    {
      title: 'Personalized Daily Horoscopes',
      description:
        'Receive daily guidance tuned to your sign, mood, and current planetary aspects.',
      accent: 'Daily',
    },
    {
      title: 'Lunar Calendar',
      description:
        'Track moon phases, eclipses, and ideal days for intention-setting and reflection.',
      accent: 'Moon',
    },
    {
      title: 'Birthchart',
      description:
        'Explore your natal blueprint with houses, aspects, and planetary placements.',
      accent: 'Chart',
    },
    {
      title: 'Compatibility',
      description:
        'Understand relationship dynamics across love, friendship, and collaboration.',
      accent: 'Match',
    },
    {
      title: 'Forecast',
      description:
        'See short and long-range astrological forecasts to plan with confidence.',
      accent: 'Future',
    },
    {
      title: 'Meditations',
      description:
        'Guided meditations designed around the sky of the day and your inner rhythm.',
      accent: 'Calm',
    },
    {
      title: 'Dreamings',
      description:
        'Capture dreams, decode recurring symbols, and reveal subconscious patterns.',
      accent: 'Dream',
    },
  ];

  return (
    <Container
      size="xl"
      display="flex"
      flexDirection="column"
      paddingX={24}
      styles={{
        minHeight: '100vh',
        paddingTop: 100,
        paddingBottom: 64,
        position: 'relative',
      }}
    >
      <Box
        styles={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(80rem 40rem at 20% -10%, color-mix(in oklab, var(--accent) 28%, transparent), transparent), radial-gradient(70rem 40rem at 90% 10%, color-mix(in oklab, var(--surface-2) 70%, transparent), transparent)',
          opacity: 0.9,
        }}
      />

      <Box
        display="flex"
        flexDirection="column"
        gap={28}
        styles={{ position: 'relative', zIndex: 1 }}
      >
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          flexWrap="wrap"
          gap={12}
          styles={{
            padding: 12,
            borderRadius: 12,
            border: '1px solid var(--surface-2)',
            backgroundColor:
              'color-mix(in oklab, var(--surface-1) 78%, transparent)',
            backdropFilter: 'blur(6px)',
          }}
        >
          <Box display="flex" alignItems="center" gap={10}>
            <Box
              width={10}
              height={10}
              borderRadius={999}
              backgroundColor="var(--accent)"
            />
            <span style={{ fontSize: 12, letterSpacing: 1.2, opacity: 0.8 }}>
              COSMIC INTELLIGENCE FOR EVERY DAY
            </span>
          </Box>
          <ThemeSwitch hideOnMobile />
        </Box>

        <Box
          display="flex"
          flexDirection="column"
          gap={22}
          styles={{
            borderRadius: 22,
            border: '1px solid var(--surface-2)',
            backgroundColor:
              'color-mix(in oklab, var(--surface-1) 84%, transparent)',
            boxShadow:
              '0 40px 80px -55px color-mix(in oklab, var(--accent) 60%, transparent)',
            padding: 32,
          }}
        >
          <h1
            style={{
              fontSize: 'clamp(2rem, 5vw, 4rem)',
              lineHeight: 1.04,
              letterSpacing: -1.5,
              fontWeight: 700,
              margin: 0,
              maxWidth: 900,
            }}
          >
            Horoscope designed for clarity, intuition, and cosmic rhythm.
          </h1>
          <p
            style={{
              margin: 0,
              maxWidth: 700,
              fontSize: 18,
              opacity: 0.86,
              lineHeight: 1.6,
            }}
          >
            Personalized guidance, moon timing, compatibility insights, and calm
            daily rituals—beautifully delivered in one focused experience.
          </p>

          <Box display="flex" gap={10} flexWrap="wrap" alignItems="center">
            <Button
              text="Start Daily Reading"
              href={`/${locale}`}
              padding={10}
            />
            <Button
              text="Explore Forecast"
              href={`/${locale}#features`}
              padding={10}
              backgroundColor="var(--surface-2)"
              color="var(--foreground)"
            />
          </Box>

          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            flexWrap="wrap"
            gap={10}
            styles={{
              border: '1px solid var(--surface-2)',
              borderRadius: 12,
              padding: 12,
            }}
          >
            <Box>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
                Cosmic notifications
              </h3>
              <p style={{ margin: 0, opacity: 0.75, fontSize: 13 }}>
                Get a gentle reminder when your daily horoscope is ready.
              </p>
            </Box>
            <Switch defaultChecked />
          </Box>
        </Box>

        <Grid container spacing={2} id="features">
          {features.map((feature) => (
            <Grid key={feature.title} item size={{ xs: 12, sm: 6, md: 4 }}>
              <Box
                display="flex"
                flexDirection="column"
                gap={10}
                styles={{
                  height: '100%',
                  borderRadius: 16,
                  border: '1px solid var(--surface-2)',
                  backgroundColor:
                    'color-mix(in oklab, var(--surface-1) 88%, transparent)',
                  padding: 18,
                }}
              >
                <Box
                  display="inline-flex"
                  alignSelf="flex-start"
                  borderRadius={999}
                  styles={{
                    backgroundColor:
                      'color-mix(in oklab, var(--accent) 25%, transparent)',
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '4px 10px',
                    letterSpacing: 0.6,
                  }}
                >
                  {feature.accent}
                </Box>
                <h2 style={{ margin: 0, fontSize: 21, letterSpacing: -0.4 }}>
                  {feature.title}
                </h2>
                <p style={{ margin: 0, opacity: 0.82, lineHeight: 1.6 }}>
                  {feature.description}
                </p>
              </Box>
            </Grid>
          ))}
        </Grid>

        <Grid container spacing={2}>
          <Grid item size={{ xs: 12, md: 8 }}>
            <Box
              display="flex"
              flexDirection="column"
              gap={8}
              styles={{
                height: '100%',
                borderRadius: 16,
                border: '1px solid var(--surface-2)',
                backgroundColor: 'var(--surface-1)',
                padding: 20,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 24 }}>
                Your daily cosmic dashboard
              </h2>
              <p style={{ margin: 0, lineHeight: 1.7, opacity: 0.84 }}>
                Start every day with one clear ritual: check your horoscope,
                align with the moon, and set your intention before the noise
                begins.
              </p>
            </Box>
          </Grid>
          <Grid item size={{ xs: 12, md: 4 }}>
            <Box
              display="flex"
              flexDirection="column"
              gap={8}
              styles={{
                height: '100%',
                borderRadius: 16,
                border: '1px solid var(--surface-2)',
                backgroundColor: 'var(--surface-1)',
                padding: 20,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 18 }}>Built for all signs</h3>
              <p style={{ margin: 0, opacity: 0.84, lineHeight: 1.7 }}>
                Aries to Pisces, personalized guidance keeps your day centered
                and intentional.
              </p>
            </Box>
          </Grid>
        </Grid>
      </Box>
    </Container>
  );
}

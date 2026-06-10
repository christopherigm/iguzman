import { Typography } from '@repo/ui/core-elements/typography';

export default function OfflinePage() {
  return (
    <body>
      <main
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100dvh',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          textAlign: 'center',
          padding: '2rem',
        }}
      >
        <Typography as="h1" variant="h2" styles={{ fontSize: '2rem', marginBottom: '1rem' }}>
          You are offline
        </Typography>
        <Typography as="p" variant="body" styles={{ fontSize: '1.125rem', opacity: 0.7, maxWidth: '28rem' }}>
          It looks like you lost your internet connection. Please check your
          network and try again.
        </Typography>
      </main>
    </body>
  );
}

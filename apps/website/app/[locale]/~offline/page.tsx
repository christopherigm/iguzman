import { Typography } from '@repo/ui/core-elements/typography';
import './page.css';

export default function OfflinePage() {
  return (
    <body>
      <main className="offline-page">
        <Typography variant="h1" marginBottom="1rem">
          You are offline
        </Typography>
        <Typography variant="body" maxWidth="28rem" styles={{ fontSize: '1.125rem', opacity: 0.7 }}>
          It looks like you lost your internet connection. Please check your
          network and try again.
        </Typography>
      </main>
    </body>
  );
}

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Server Video Editor',
  description: '',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

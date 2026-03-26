import { setRequestLocale } from 'next-intl/server';
import { AdminSidebar } from './admin-sidebar';
import { Box } from '@repo/ui/core-elements/box';
import Container from '@repo/ui/core-elements/container';
import { NavbarSpacer } from '@repo/ui/core-elements/navbar';
import './admin-layout.css';

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function AdminLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <NavbarSpacer />
      <Box className="admin-shell">
        <AdminSidebar />
        <Container paddingX={10}>{children}</Container>
      </Box>
    </>
  );
}

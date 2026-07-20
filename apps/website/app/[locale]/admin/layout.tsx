import { setRequestLocale } from "next-intl/server";
import { AdminSidebar } from "./admin-sidebar";
import { Box } from "@repo/ui/core-elements/box";
import Container from "@repo/ui/core-elements/container";
import "./admin-layout.css";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function AdminLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      {/* Clear the fixed navbar via the shared @repo/ui CSS var, instead of
          importing the heavy "use client" navbar module for a spacer. */}
      <Box height="var(--ui-navbar-height, 57px)" />
      <Box className="admin-shell">
        <AdminSidebar />
        {/* `admin-content` is a styling hook only (see admin-layout.css): on
            xs/sm it lets the page's first <Breadcrumbs> become the fixed bar
            beside the "Admin Menu ☰" toggle. */}
        {/* paddingBottom: every admin page (lists, forms) otherwise ends flush
            against the bottom of the page with no breathing room. */}
        <Container
          className="admin-content"
          paddingX={10}
          marginTop={16}
          paddingBottom={40}
        >
          {children}
        </Container>
      </Box>
    </>
  );
}

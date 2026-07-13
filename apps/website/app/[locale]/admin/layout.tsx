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
        <Container paddingX={10}>{children}</Container>
      </Box>
    </>
  );
}

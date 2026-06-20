import { setRequestLocale } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { Simulator } from "../../components/simulator";
import { NavbarSpacer } from "@repo/ui/core-elements/navbar";

type Props = { params: Promise<{ locale: string }> };

export default async function Home({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <NavbarSpacer />
      <Container
        display="flex"
        flexDirection="column"
        alignItems="center"
        styles={{ minHeight: "100vh", paddingTop: 12, paddingBottom: 64 }}
        size="lg"
      >
        <Simulator />
      </Container>
    </>
  );
}

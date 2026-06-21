import { setRequestLocale } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { NavbarSpacer } from "@repo/ui/core-elements/navbar";
import { MovieCatalog } from "@/components/movie-catalog/movie-catalog";

type Props = { params: Promise<{ locale: string }> };

export default async function Home({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <Container paddingX={12}>
      <NavbarSpacer />
      <MovieCatalog />
    </Container>
  );
}

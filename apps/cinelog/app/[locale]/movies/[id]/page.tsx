import { setRequestLocale } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { NavbarSpacer, PageBottomSpacer } from "@repo/ui/core-elements/navbar";
import { MovieDetail } from "./movie-detail";

type Props = { params: Promise<{ locale: string; id: string }> };

export default async function MovieDetailPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  return (
    <Container>
      <NavbarSpacer />
      <MovieDetail id={id} />
      <PageBottomSpacer />
    </Container>
  );
}

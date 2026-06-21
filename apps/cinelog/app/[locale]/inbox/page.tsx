import { setRequestLocale } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { NavbarSpacer } from "@repo/ui/core-elements/navbar";
import { Inbox } from "@/components/inbox/inbox";

type Props = { params: Promise<{ locale: string }> };

export default async function InboxPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <Container paddingX={12}>
      <NavbarSpacer />
      <Inbox />
    </Container>
  );
}

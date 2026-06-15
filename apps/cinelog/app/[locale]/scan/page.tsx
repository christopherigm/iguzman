import { setRequestLocale } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { NavbarSpacer } from "@repo/ui/core-elements/navbar";
import { BarcodeScanner } from "@/components/barcode-scanner/barcode-scanner";

type Props = { params: Promise<{ locale: string }> };

export default async function ScanPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <Container>
      <NavbarSpacer />
      <BarcodeScanner />
    </Container>
  );
}

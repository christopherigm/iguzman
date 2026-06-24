import { getTranslations, setRequestLocale } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Container } from "@repo/ui/core-elements/container";
import { Grid } from "@repo/ui/core-elements/grid";
import { Typography } from "@repo/ui/core-elements/typography";
import { NavbarSpacer } from "@repo/ui/core-elements/navbar";
import { BarcodeScanner } from "@/components/barcode-scanner/barcode-scanner";
import { ManualMovieForm } from "@/components/manual-movie-form/manual-movie-form";
import { Inbox } from "@/components/inbox/inbox";

type Props = { params: Promise<{ locale: string }> };

// "Add Movie" hub: scan / manual entry up top, the review inbox below. A scan
// never writes straight to the catalog - it queues a per-user ScanQueue entry
// the user approves in the inbox on this same page.
export default async function AddMoviePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("ScannerPage");

  return (
    <Container paddingX={12}>
      <NavbarSpacer />
      {/* Full-width page header above the scan / manual-entry grid. */}
      <Box flexDirection="column" gap={4} paddingTop={16}>
        <Typography as="h1" variant="h2" fontWeight={700}>
          {t("pageTitle")}
        </Typography>
        <Typography variant="body" styles={{ opacity: 0.6 }}>
          {t("pageSubtitle")}
        </Typography>
      </Box>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <BarcodeScanner />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <ManualMovieForm />
        </Grid>
      </Grid>
      <Inbox />
    </Container>
  );
}

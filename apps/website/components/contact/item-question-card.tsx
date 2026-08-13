import { getTranslations } from "next-intl/server";
import { Card } from "@repo/ui/core-elements/card";
import { Grid } from "@repo/ui/core-elements/grid";
import type { ContactRelatedKind } from "@/lib/contact";
import { ContactFormClient } from "./contact-form-client";

interface ItemQuestionCardProps {
  /** The catalog family this item belongs to - tags the message in the inbox. */
  kind: ContactRelatedKind;
  id: number;
  /** The item's name, already resolved for the current locale by the page. */
  name: string;
}

/**
 * "Have a question about this?" - the contact page's own form, embedded on a
 * detail page and pre-tagged with the item so the message lands in the inbox
 * with its context (and so the reply can quote what it was about).
 *
 * One component for all three catalog families - product, service and menu item
 * - rather than a copy per detail module: it is the same card asking the same
 * question, and the two copies that preceded it had already started to describe
 * themselves differently. It renders its own grid cell, so it drops into any of
 * the detail grids as a small card in the bottom info row (sm:6, md:4), pushed
 * below its siblings on a phone.
 *
 * The WhatsApp option comes for free - `ContactFormClient` always passes
 * `collectPhone`, so a customer here picks their reply channel exactly as they
 * do on `/contact`.
 */
export async function ItemQuestionCard({
  kind,
  id,
  name,
}: ItemQuestionCardProps) {
  const t = await getTranslations("Contact");

  return (
    <Grid size={{ xs: 12, sm: 6, md: 4 }} reorder={{ xs: "last" }}>
      <Card width="100%">
        <ContactFormClient
          heading={t("askAboutHeading")}
          description={t("askAboutDescription")}
          related={{ kind, id, name }}
        />
      </Card>
    </Grid>
  );
}

export default ItemQuestionCard;

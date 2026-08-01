"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { SelectOption } from "@repo/ui/core-elements/select";
import {
  LocationContributeForm,
  type ParentPlaceOption,
} from "@/components/contribute/location-contribute-form";
import { SubmittedPanel } from "@/components/contribute/submitted-panel";

/**
 * The standalone route's half of the place form: what happens *after* the API
 * accepts one.
 *
 * `LocationContributeForm` deliberately renders no confirmation of its own,
 * because its other consumer - the sighting flow - embeds it under a form the
 * contributor is still filling in, where a "submitted" card would read as the
 * sighting having been filed. So the aftermath lives with whoever owns the
 * surface, and on this route that is a `SubmittedPanel` like the other two flows
 * end with.
 *
 * There is no link to the new place, for the same reason there is none in those
 * two: its page 404s for everyone until an administrator publishes it.
 */

interface Props {
  parents: ParentPlaceOption[];
  counties: SelectOption[];
  /** Where "done" goes - the journal's landing, since a place has no page yet. */
  doneLabel: string;
  doneHref: string;
}

export function LocationContributePanel({
  parents,
  counties,
  doneLabel,
  doneHref,
}: Props) {
  const t = useTranslations("Contribute");
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <SubmittedPanel
        title={t("placeSubmittedTitle")}
        againLabel={t("placeAgain")}
        onAgain={() => setDone(false)}
        doneLabel={doneLabel}
        doneHref={doneHref}
      />
    );
  }

  return (
    <LocationContributeForm
      parents={parents}
      counties={counties}
      onCreated={() => setDone(true)}
    />
  );
}

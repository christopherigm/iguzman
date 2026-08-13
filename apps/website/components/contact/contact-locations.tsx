"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@repo/i18n/navigation";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Grid } from "@repo/ui/core-elements/grid";
import { Button } from "@repo/ui/core-elements/button";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import { Typography } from "@repo/ui/core-elements/typography";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { PlaceMap } from "@/components/place-map";
import { deleteBranch } from "@/lib/admin-api";
import { branchHasCoordinates, type Branch } from "@/lib/contact";
import { directionsHref } from "@/lib/maps";

interface ContactLocationsProps {
  branches: Branch[];
  locale: string;
  /** When true, each location gets Edit/Remove controls (an admin viewing the page). */
  isAdmin: boolean;
  /**
   * The mark drawn inside each map pin - the tenant's **brandmark**, not its
   * logo: the pin's head is a 34 px circle that crops what it is given, and a
   * wide wordmark comes out as three letters from the middle of itself. With no
   * brandmark the pin is a plain accent-coloured teardrop, which is fine.
   */
  pinIcon?: string | null;
}

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
function waHref(whatsapp: string): string {
  return `https://wa.me/${whatsapp.replace(/[^\d]/g, "")}`;
}

/**
 * Renders a tenant's physical locations. With a single location it is a
 * prominent two-column detail + map view; with several it becomes a grid of
 * cards. An admin viewing the page gets Edit (→ CMS) and Remove controls on each
 * location, mirroring the item-detail admin affordances.
 */
export function ContactLocations({
  branches,
  locale,
  isAdmin,
  pinIcon = null,
}: ContactLocationsProps) {
  const t = useTranslations("Contact");
  const tAdmin = useTranslations("Admin");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (branches.length === 0) return null;

  const single = branches.length === 1;

  const handleDelete = async (id: number) => {
    setDeleting(true);
    try {
      await deleteBranch(id);
      router.refresh();
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  const branchName = (branch: Branch) =>
    (locale === "en" ? branch.en_name : branch.name) ??
    branch.name ??
    branch.en_name ??
    "";

  const renderAdminControls = (branch: Branch) =>
    isAdmin ? (
      <Box gap={8} alignItems="center">
        <IconButton
          icon="/icons/edit.svg"
          kind="warning"
          size="sm"
          href={`/admin/branches/${branch.id}`}
          aria-label={tAdmin("edit")}
          title={tAdmin("edit")}
        />
        <IconButton
          icon="/icons/delete-trash-icon.svg"
          kind="error"
          size="sm"
          aria-label={tAdmin("delete")}
          title={tAdmin("delete")}
          onClick={() => setPendingDelete(branch.id)}
        />
      </Box>
    ) : null;

  const renderDetails = (branch: Branch) => {
    const name = branchName(branch);
    return (
      <Box flexDirection="column" gap={12}>
        <Box
          alignItems="flex-start"
          justifyContent="space-between"
          gap={12}
          flexWrap="wrap"
        >
          <Box flexDirection="column" gap={4} flex="1" minWidth={0}>
            {name && (
              <Typography as="h3" variant="h4" margin={0}>
                {name}
              </Typography>
            )}
            {branch.address && (
              <Typography
                variant="body"
                color="var(--muted-foreground, #6b7280)"
                styles={{ whiteSpace: "pre-line" }}
              >
                {branch.address}
              </Typography>
            )}
          </Box>
          {renderAdminControls(branch)}
        </Box>

        <Box gap={8} flexWrap="wrap">
          {branch.phone && (
            <Button text={t("call")} size="sm" href={telHref(branch.phone)} />
          )}
          {branch.whatsapp && (
            <Button
              text={t("whatsapp")}
              size="sm"
              href={waHref(branch.whatsapp)}
              target="_blank"
            />
          )}
          {branch.email && (
            <Button
              text={t("sendEmail")}
              size="sm"
              href={`mailto:${branch.email}`}
            />
          )}
          {branchHasCoordinates(branch) && (
            <Button
              text={t("getDirections")}
              size="sm"
              kind="primary"
              href={directionsHref(branch.latitude!, branch.longitude!)}
              target="_blank"
            />
          )}
        </Box>

        {/* OpenStreetMap tiles drawn into the page, not a Google iframe: the
            pin is ours, so it wears the tenant's own brandmark instead of a
            generic red teardrop. The shared single-pin wrapper, so this map,
            an event's and the booking page's are one thing - it also carries
            the tenant's chosen basemap and that provider's required credit. */}
        {branchHasCoordinates(branch) && (
          <PlaceMap
            latitude={Number(branch.latitude)}
            longitude={Number(branch.longitude)}
            title={name}
            pinIcon={pinIcon}
            height={single ? 320 : 220}
          />
        )}

        {/* How to find the entrance once you are there, under the map that got
          the reader to the street. Not merged into the address above: that one
          is the postal line, this one is the landmark - and a reader scanning
          for a street name must not have to read past a note about parking. */}
        {branch.location_details && (
          <Typography
            variant="caption"
            color="var(--foreground)"
            styles={{ whiteSpace: "pre-line" }}
          >
            <Typography as="span" variant="label" color="var(--muted, #757575)">
              {t("locationDetailsLabel")}
            </Typography>{" "}
            {branch.location_details}
          </Typography>
        )}
      </Box>
    );
  };

  const modal =
    pendingDelete !== null ? (
      <ConfirmationModal
        title={tAdmin("confirmDeleteTitle")}
        text={tAdmin("confirmDelete")}
        okDisabled={deleting}
        okCallback={() => void handleDelete(pendingDelete)}
        cancelCallback={() => setPendingDelete(null)}
        okLabel={tCommon("ok")}
        cancelLabel={tCommon("cancel")}
      />
    ) : null;

  if (single) {
    return (
      <Box flexDirection="column" gap={16}>
        {renderDetails(branches[0]!)}
        {modal}
      </Box>
    );
  }

  return (
    <>
      <Grid container spacing={2}>
        {branches.map((branch) => (
          <Grid key={branch.id} size={{ xs: 12, sm: 6 }}>
            <Card gap={12} height="100%">
              {renderDetails(branch)}
            </Card>
          </Grid>
        ))}
      </Grid>
      {modal}
    </>
  );
}

export default ContactLocations;

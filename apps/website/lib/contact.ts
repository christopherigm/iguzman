/** One social-media link stored on `System.social_links`. */
export interface SocialLink {
  platform: string;
  url: string;
}

/** A physical location for the current tenant (the API's `Branch`). */
export interface Branch {
  id: number;
  enabled: boolean;
  is_main: boolean;
  name: string | null;
  en_name: string | null;
  address: string | null;
  /** How to find the entrance once you are there - the landmark, the gate, the
   *  floor. Rendered under the map beside the address, never merged into it. */
  location_details: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  /** Decimal strings from the API (DRF serializes DecimalField as a string). */
  latitude: string | null;
  longitude: string | null;
  sort_order: number;
}

/** The catalog family a contact message can be about (matches the API kinds). */
export type ContactRelatedKind = "product" | "service" | "food";

export interface ContactMessagePayload {
  name?: string;
  email?: string;
  subject?: string;
  message: string;
  related_kind?: ContactRelatedKind;
  related_id?: number;
  related_name?: string;
}

/**
 * Submit a contact message from the browser. Posts to the same-origin
 * `/api/contact` route handler, which forwards to Django (attaching the bearer
 * token when the sender is signed in, else scoping by host). Throws on failure so
 * the shared `ContactForm` can show its error state.
 */
export async function sendContactMessage(
  payload: ContactMessagePayload,
): Promise<void> {
  const res = await fetch("/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Contact submit failed: ${res.status}`);
  }
}

/** Whether a branch carries a renderable map pointer. */
export function branchHasCoordinates(branch: Branch): boolean {
  return branch.latitude !== null && branch.longitude !== null;
}

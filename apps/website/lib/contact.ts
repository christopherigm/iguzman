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
  /** The English version of the note above, picked on an `en` page exactly as
   *  `en_name` is. Blank falls back to `location_details`. */
  en_location_details: string | null;
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

/** Which channel a customer asked to be answered on (matches the API's choices). */
export type ContactChannel = "email" | "whatsapp";

export interface ContactMessagePayload {
  name?: string;
  email?: string;
  /** The customer's WhatsApp number. Either this or `email` must be present. */
  phone?: string;
  preferred_channel?: ContactChannel;
  subject?: string;
  message: string;
  related_kind?: ContactRelatedKind;
  related_id?: number;
  related_name?: string;
}

/**
 * The click-to-chat URL for a WhatsApp number, optionally with a message
 * prefilled. wa.me takes digits only - it rejects the spaces, dashes and
 * parentheses people actually type - so the number is stripped here rather than
 * at every call site.
 *
 * Used both ways round: by the contact page for a *branch's* number, and by the
 * admin inbox for a *customer's*.
 */
export function whatsappHref(number: string, text?: string): string {
  const digits = number.replace(/[^\d]/g, "");
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${digits}${query}`;
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

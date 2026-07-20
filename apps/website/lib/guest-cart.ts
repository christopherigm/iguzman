/**
 * The anonymous visitor's cart and favorites, in localStorage.
 *
 * A guest has no rows, so the browser holds **references** - which item, which
 * ingredients, how many - and nothing else. Every price, label
 * and stock flag comes back from `POST /api/guest/resolve/`, which reads them
 * out of the catalog server-side. That split is deliberate and load-bearing: a
 * cached price in localStorage would be a price the customer could edit, and
 * checkout re-reads these same references anyway, so a stored total could only
 * ever disagree with what is actually charged.
 *
 * The line's **index in `cart`** is its handle - the guest equivalent of a
 * `CartItem` row id. The resolve endpoint echoes it back as `id`, which is what
 * lets the cart page render, re-quantify and remove guest lines through the same
 * components a signed-in cart uses.
 *
 * Browser-only. Every reader guards `typeof window`, so importing this from a
 * component that also renders on the server is safe; it simply reads empty.
 */

const STORAGE_KEY = "website_guest_cart";

/** Fired on same-tab writes. `storage` only fires in the *other* tabs, so
 *  without this the navbar badge and the card that was clicked disagree. */
const CHANGE_EVENT = "guest-cart-changed";

export const MAX_GUEST_QUANTITY = 99;

/** Mirrors the API's `MAX_GUEST_LINES` - a cart the resolve endpoint would
 *  truncate is worse than one the browser refused to grow. */
export const MAX_GUEST_LINES = 50;

export type BuyableKind = "product" | "service" | "menu_item";

/** One chosen ingredient on a menu line. `option` names the alternative the
 *  customer swapped in from a choice group, absent when they kept the default. */
export interface GuestCustomizationRow {
  ingredient: number;
  quantity: number;
  option?: number;
}

export interface GuestCartLine {
  kind: BuyableKind;
  /** The catalog item's id. */
  id: number;
  customization?: GuestCustomizationRow[];
  quantity: number;
}

export interface GuestFavoriteRef {
  kind: BuyableKind;
  id: number;
}

export interface GuestState {
  cart: GuestCartLine[];
  favorites: GuestFavoriteRef[];
}

export const EMPTY_GUEST_STATE: GuestState = { cart: [], favorites: [] };

/**
 * What makes two guest lines the same line: the item and - for a menu line -
 * the ingredient selection, which is part of that line's identity.
 *
 * Only an approximation of the server's `normalize_selection`, which also knows
 * each group's defaults. That is fine: this decides whether *the browser* merges
 * two adds, and the server re-normalises and merges again on resolve. The worst
 * case is two local lines that the resolved cart shows as one.
 */
function lineKey(line: GuestCartLine): string {
  const customization = [...(line.customization ?? [])]
    .sort((a, b) => a.ingredient - b.ingredient)
    .map((row) => `${row.ingredient}:${row.quantity}:${row.option ?? ""}`)
    .join(",");
  return `${line.kind}:${line.id}:${customization}`;
}

/** Whether two references point at the same catalog item. */
function sameItem(a: GuestFavoriteRef, b: GuestFavoriteRef): boolean {
  return a.kind === b.kind && a.id === b.id;
}

function isKind(value: unknown): value is BuyableKind {
  return value === "product" || value === "service" || value === "menu_item";
}

/**
 * Parse whatever is in localStorage into a state we are willing to act on.
 *
 * Defensive because this string is fully user-controlled - a hand-edited or
 * half-written value must degrade to an empty cart, never throw on a render. It
 * is only shape validation: a line that survives this is still just a claim
 * about which item was chosen, and the server checks that claim.
 */
function parse(raw: string | null): GuestState {
  if (!raw) return EMPTY_GUEST_STATE;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return EMPTY_GUEST_STATE;

    const { cart, favorites } = parsed as Partial<GuestState>;

    return {
      cart: (Array.isArray(cart) ? cart : [])
        .filter(
          (line): line is GuestCartLine =>
            typeof line === "object" &&
            line !== null &&
            isKind(line.kind) &&
            typeof line.id === "number",
        )
        .map((line) => ({
          ...line,
          quantity: Math.min(
            Math.max(Math.trunc(line.quantity) || 1, 1),
            MAX_GUEST_QUANTITY,
          ),
        }))
        .slice(0, MAX_GUEST_LINES),
      favorites: (Array.isArray(favorites) ? favorites : [])
        .filter(
          (ref): ref is GuestFavoriteRef =>
            typeof ref === "object" &&
            ref !== null &&
            isKind(ref.kind) &&
            typeof ref.id === "number",
        )
        .slice(0, MAX_GUEST_LINES),
    };
  } catch {
    return EMPTY_GUEST_STATE;
  }
}

export function readGuestState(): GuestState {
  if (typeof window === "undefined") return EMPTY_GUEST_STATE;
  try {
    return parse(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    // Private-browsing modes throw on access rather than returning null.
    return EMPTY_GUEST_STATE;
  }
}

/**
 * The last parsed state, kept so `getGuestSnapshot` can hand back the *same*
 * object until something actually changes.
 *
 * This is what makes the state usable with `useSyncExternalStore`, which
 * compares snapshots by identity: a fresh `readGuestState()` object on every
 * call would look like a change on every render and spin forever.
 */
let snapshot: GuestState | null = null;

export function getGuestSnapshot(): GuestState {
  snapshot ??= readGuestState();
  return snapshot;
}

/** The snapshot for a server render: always empty, because localStorage does not
 *  exist there. The first client render matches it, and the subscription then
 *  paints the real state - so a guest's cart appears just after hydration
 *  rather than mismatching the HTML. */
export function getGuestServerSnapshot(): GuestState {
  return EMPTY_GUEST_STATE;
}

function invalidateSnapshot(): void {
  snapshot = null;
}

function writeGuestState(state: GuestState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // A full or blocked store must not break the click. The cart stays as it
    // was in memory and the next read simply returns the older state.
  }
  invalidateSnapshot();
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Run `mutate` against the current state and persist the result. */
function update(mutate: (state: GuestState) => GuestState): GuestState {
  const next = mutate(readGuestState());
  writeGuestState(next);
  return next;
}

/**
 * Watch for changes, in this tab (`CHANGE_EVENT`) and in others (`storage`).
 * Returns the unsubscribe. Cross-tab matters more than it looks: a customer with
 * the catalog open twice must not lose one tab's adds to the other's writes.
 */
export function subscribeGuestState(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  // Another tab's write has to drop *this* tab's cached snapshot too, or the
  // subscriber would be told something changed and then read the old object.
  const notify = () => {
    invalidateSnapshot();
    onChange();
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEY) notify();
  };

  window.addEventListener(CHANGE_EVENT, notify);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(CHANGE_EVENT, notify);
    window.removeEventListener("storage", onStorage);
  };
}

/** Total quantity - what the navbar badge shows, matching the API's `count`. */
export function guestCartCount(state: GuestState): number {
  return state.cart.reduce((total, line) => total + line.quantity, 0);
}

/**
 * Add a line, or raise the quantity of the identical one already there.
 *
 * The same rule the API applies to a signed-in add: clicking twice means "two of
 * these", not two lines.
 */
export function addGuestCartLine(line: GuestCartLine): void {
  update((state) => {
    const key = lineKey(line);
    const index = state.cart.findIndex((existing) => lineKey(existing) === key);

    if (index === -1) {
      if (state.cart.length >= MAX_GUEST_LINES) return state;
      return { ...state, cart: [...state.cart, line] };
    }

    const cart = [...state.cart];
    const existing = cart[index]!;
    cart[index] = {
      ...existing,
      quantity: Math.min(existing.quantity + line.quantity, MAX_GUEST_QUANTITY),
    };
    return { ...state, cart };
  });
}

/**
 * Set one line's quantity by its handle (its index).
 *
 * Splicing is what makes the index a handle at all - `removeGuestCartLine`
 * shifts every later line, so a component holding a stale index would address
 * its neighbour. Every consumer re-reads through `subscribeGuestState` after a
 * write, which is what keeps that from happening.
 */
export function setGuestCartQuantity(index: number, quantity: number): void {
  update((state) => {
    const existing = state.cart[index];
    if (!existing) return state;

    const cart = [...state.cart];
    cart[index] = {
      ...existing,
      quantity: Math.min(Math.max(quantity, 1), MAX_GUEST_QUANTITY),
    };
    return { ...state, cart };
  });
}

export function removeGuestCartLine(index: number): void {
  update((state) => ({
    ...state,
    cart: state.cart.filter((_, i) => i !== index),
  }));
}

/**
 * The handle of the line for exactly this item, or -1. A sibling variant is its
 * own catalog item, so it has its own line and its own handle.
 *
 * For `menu_item` the identity also includes the ingredient selection, and the
 * catalog card only ever adds/removes the *base* line - so this matches the
 * uncustomised one and leaves customised siblings alone, exactly as
 * `findCartLineId` does for a signed-in cart.
 */
export function findGuestCartLine(
  state: GuestState,
  kind: BuyableKind,
  id: number,
): number {
  return state.cart.findIndex((line) => {
    if (line.kind !== kind || line.id !== id) return false;
    return kind === "menu_item"
      ? (line.customization?.length ?? 0) === 0
      : true;
  });
}

export function isGuestFavorite(
  state: GuestState,
  kind: BuyableKind,
  id: number,
): boolean {
  return state.favorites.some((ref) => sameItem(ref, { kind, id }));
}

/** Save or unsave an item. Returns whether it is saved afterwards. */
export function toggleGuestFavorite(kind: BuyableKind, id: number): boolean {
  const ref = { kind, id };
  let saved = false;

  update((state) => {
    if (state.favorites.some((existing) => sameItem(existing, ref))) {
      return {
        ...state,
        favorites: state.favorites.filter(
          (existing) => !sameItem(existing, ref),
        ),
      };
    }
    saved = true;
    if (state.favorites.length >= MAX_GUEST_LINES) {
      saved = false;
      return state;
    }
    return { ...state, favorites: [...state.favorites, ref] };
  });

  return saved;
}

/** Drop everything. Called once the state has been merged into an account. */
export function clearGuestState(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // See writeGuestState.
  }
  invalidateSnapshot();
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Whether there is anything worth merging into an account at sign-in. */
export function hasGuestState(state: GuestState): boolean {
  return state.cart.length > 0 || state.favorites.length > 0;
}

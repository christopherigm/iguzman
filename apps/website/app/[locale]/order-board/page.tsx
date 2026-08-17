import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getSession } from "@repo/auth/session";
import { OrderBoard } from "./order-board";

type Props = {
  params: Promise<{ locale: string }>;
};

/**
 * The order board: the screen a cook (or anyone packing an order) watches to
 * see what has come in and to mark it handed over.
 *
 * The counterpart to `/pos` - that screen *creates* orders at a counter, this
 * one *works through* them, whatever their source: the storefront, a guest
 * checkout, or the till in the next room. Like the till it needs no per-site
 * code and no new backend models; it is a platform route reading the same
 * `/api/orders/admin/` the CMS list reads.
 *
 * Admin-only, and guarded twice for the reason `/pos` is: `proxy.ts` keeps an
 * anonymous visitor off the route, and the `isAdmin` check below covers what a
 * prefix cannot - a *signed-in but ordinary* customer, who sails past a prefix
 * guard with a valid session. Django re-derives the claim from the token on
 * every call, so neither check is what protects the data; they decide what is
 * worth rendering.
 *
 * Unlike the till, nothing is loaded server-side: the board is a live view of
 * something that changes while it is being watched, so it fetches its own list
 * on mount and keeps polling (see `order-board.tsx`). A server-rendered first
 * list would only be a snapshot the client immediately replaced.
 */
export default async function OrderBoardPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getSession();
  if (session?.isAdmin !== true) notFound();

  return <OrderBoard />;
}

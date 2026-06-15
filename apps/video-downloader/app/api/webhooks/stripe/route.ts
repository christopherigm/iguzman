import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { addCredits, getCreditKey } from "@/lib/credits-db";
import logger from "@/lib/logger";

const log = logger.child({ module: "api/webhooks/stripe" });

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

export async function POST(request: NextRequest) {
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    log.error("Stripe env vars not configured");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";

  const stripe = new Stripe(STRIPE_SECRET_KEY);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    log.warn({ err }, "Stripe webhook signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  // Retrieve the full session so metadata is always present (webhook payload may omit it)
  const sessionId = (event.data.object as Stripe.Checkout.Session).id;
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const { creditsKey, credits } = session.metadata ?? {};

  if (!creditsKey || !credits) {
    log.error(
      { sessionId: session.id },
      "Missing metadata in checkout session",
    );
    return NextResponse.json({ error: "Missing metadata" }, { status: 400 });
  }

  const amount = parseInt(credits, 10);
  if (isNaN(amount) || amount <= 0) {
    log.error({ credits }, "Invalid credits amount in metadata");
    return NextResponse.json(
      { error: "Invalid credits amount" },
      { status: 400 },
    );
  }

  const exists = await getCreditKey(creditsKey);
  if (!exists) {
    log.error({ creditsKey }, "Credits key from metadata not found in DB");
    return NextResponse.json({ error: "Key not found" }, { status: 400 });
  }

  await addCredits(creditsKey, amount);
  log.info({ creditsKey, amount }, "Credits added after successful payment");

  return NextResponse.json({ received: true });
}

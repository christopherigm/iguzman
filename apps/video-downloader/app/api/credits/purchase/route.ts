import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createCreditKey, getCreditKey } from "@/lib/credits-db";
import { CREDIT_PACKS } from "@/lib/credit-packs";
import logger from "@/lib/logger";

const log = logger.child({ module: "api/credits/purchase" });

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

function getPack(id: string) {
  return CREDIT_PACKS.find((p) => p.id === id);
}

export async function POST(request: NextRequest) {
  if (!STRIPE_SECRET_KEY) {
    log.error("STRIPE_SECRET_KEY is not configured");
    return NextResponse.json(
      { error: "Payments not configured" },
      { status: 500 },
    );
  }

  let body: { packId?: string; existingKey?: string; locale?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const pack = getPack(body.packId ?? "");
  if (!pack) {
    return NextResponse.json({ error: "Invalid pack ID" }, { status: 400 });
  }

  const locale = body.locale?.trim() || "en";
  const creditsPageUrl = `${BASE_URL}/${locale}/credits`;

  // Validate existing key if provided, else we'll create a new one after payment
  const existingKey = body.existingKey?.trim() || undefined;
  if (existingKey) {
    const doc = await getCreditKey(existingKey);
    if (!doc) {
      return NextResponse.json(
        { error: "INVALID_CREDITS_KEY" },
        { status: 400 },
      );
    }
  }

  // Generate a new key now (0 credits) if the user has none; we'll top it up via webhook.
  // If they have an existing key, we use that in metadata instead.
  const targetKey = existingKey ?? (await createCreditKey(0));

  const stripe = new Stripe(STRIPE_SECRET_KEY);

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: pack.priceCents,
          product_data: {
            name: `${pack.label} Credit Pack`,
            description: `${pack.credits} credits for video processing`,
          },
        },
      },
    ],
    metadata: {
      creditsKey: targetKey,
      credits: String(pack.credits),
      packId: pack.id,
    },
    success_url: `${creditsPageUrl}?credits_key=${targetKey}&credits_added=${pack.credits}`,
    cancel_url: creditsPageUrl,
  });

  log.info(
    { packId: pack.id, credits: pack.credits },
    "Stripe checkout session created",
  );
  return NextResponse.json({ url: session.url });
}

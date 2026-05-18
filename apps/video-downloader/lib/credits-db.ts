import { type Collection, type WithId } from 'mongodb';
import { connectToDatabase } from '@repo/helpers/mongo-db';
import { randomUUID } from 'crypto';

const DB_NAME = 'videos';
const IS_PROD = process.env.NODE_ENV?.trim() === 'production';
const MONGO_URI = IS_PROD
  ? (process.env.MONGO_URI ?? 'mongodb://mongodb.video-downloader-2.svc.cluster.local:27017')
  : 'mongodb://127.0.0.1:27017';

/* ── Schemas ────────────────────────────────────────── */

export interface CreditKeyDocument {
  key: string;
  credits: number;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export interface CouponDocument {
  code: string;
  credits: number;
  maxRedemptions: number;
  redeemed: number;
  expiresAt: Date | null;
}

/* ── Collection accessors ───────────────────────────── */

let keysCol: Collection<CreditKeyDocument> | null = null;
let couponsCol: Collection<CouponDocument> | null = null;

async function getKeysCollection(): Promise<Collection<CreditKeyDocument>> {
  if (!keysCol) {
    const db = await connectToDatabase(DB_NAME, MONGO_URI);
    keysCol = db.collection<CreditKeyDocument>('credit_keys');
    await keysCol.createIndex({ key: 1 }, { unique: true });
  }
  return keysCol;
}

async function getCouponsCollection(): Promise<Collection<CouponDocument>> {
  if (!couponsCol) {
    const db = await connectToDatabase(DB_NAME, MONGO_URI);
    couponsCol = db.collection<CouponDocument>('coupons');
    await couponsCol.createIndex({ code: 1 }, { unique: true });
  }
  return couponsCol;
}

/* ── Key operations ─────────────────────────────────── */

export async function createCreditKey(initialCredits = 0): Promise<string> {
  const col = await getKeysCollection();
  const key = randomUUID();
  await col.insertOne({
    key,
    credits: initialCredits,
    createdAt: new Date(),
    lastUsedAt: null,
  });
  return key;
}

export async function getCreditKey(
  key: string,
): Promise<WithId<CreditKeyDocument> | null> {
  const col = await getKeysCollection();
  return col.findOne({ key });
}

export async function addCredits(key: string, amount: number): Promise<boolean> {
  const col = await getKeysCollection();
  const result = await col.updateOne({ key }, { $inc: { credits: amount } });
  return result.matchedCount > 0;
}

/**
 * Atomically deduct `amount` credits from a key.
 * Returns the remaining credits after deduction, or null if the key doesn't
 * exist or has insufficient credits.
 */
export async function deductCredits(
  key: string,
  amount: number,
): Promise<number | null> {
  const col = await getKeysCollection();
  const result = await col.findOneAndUpdate(
    { key, credits: { $gte: amount } },
    {
      $inc: { credits: -amount },
      $set: { lastUsedAt: new Date() },
    },
    { returnDocument: 'after' },
  );
  if (!result) return null;
  return result.credits;
}

/* ── Coupon operations ──────────────────────────────── */

/**
 * Attempt to redeem a coupon against a key.
 * Returns the credits added, or null if the coupon is invalid/exhausted/expired.
 */
export async function redeemCoupon(
  code: string,
  key: string,
): Promise<number | null> {
  const col = await getCouponsCollection();
  const now = new Date();

  const coupon = await col.findOneAndUpdate(
    {
      code: code.toUpperCase(),
      $expr: { $lt: ['$redeemed', '$maxRedemptions'] },
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    },
    { $inc: { redeemed: 1 } },
    { returnDocument: 'after' },
  );

  if (!coupon) return null;

  await addCredits(key, coupon.credits);
  return coupon.credits;
}

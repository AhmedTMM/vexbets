import { z } from "zod";

/** Every id in the system is a UUID. */
export const Id = z.uuid();
export type Id = z.infer<typeof Id>;

/** ISO-8601 timestamp with offset, e.g. "2026-11-14T18:00:00Z". */
export const Timestamp = z.iso.datetime({ offset: true });
export type Timestamp = z.infer<typeof Timestamp>;

/** Epoch milliseconds. Used where a value is hashed, so it never gets reformatted. */
export const EpochMs = z.int().nonnegative();

/**
 * Play-money credits, always whole numbers. One winning share pays SHARE_PAYOUT
 * credits, so a price of 63 credits reads like "63¢" on Kalshi.
 */
export const Credits = z.int().nonnegative();
export const SignedCredits = z.int();

/** Probability in basis points: 0..10000 (6300 = 63%). */
export const Bps = z.int().min(0).max(10_000);

/** Whole shares of one outcome. */
export const Shares = z.int().min(1).max(100_000);

/** Vexo band number from the band's bag: 7 means the band "Vexo-HACK-07". */
export const BandNumber = z.int().min(1).max(999);
export type BandNumber = z.infer<typeof BandNumber>;

export function bandName(band: BandNumber): string {
  return `Vexo-HACK-${String(band).padStart(2, "0")}`;
}

/** Lowercase hex SHA-256. */
export const Sha256Hex = z.string().regex(/^[0-9a-f]{64}$/);

export const Page = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).optional(),
});

export const UserSummary = z.object({
  id: Id,
  handle: z.string().regex(/^[a-z0-9_]{2,24}$/),
  displayName: z.string().trim().min(1).max(50),
});
export type UserSummary = z.infer<typeof UserSummary>;

export const Me = UserSummary.extend({
  balance: Credits,
});
export type Me = z.infer<typeof Me>;

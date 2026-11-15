/**
 * Claims a payment's nonce and reserves the payer's funds in one statement.
 *
 * The gateway checks a payment, forwards the call and settles only after the seller
 * answers. Without a reservation, one balance could back several calls in flight: each
 * check saw the full balance. The row is inserted only if the payer's other pending
 * payments plus this one fit in the balance read by the check. It is a single INSERT, so
 * two concurrent requests cannot both pass on the same funds (a read followed by an
 * insert would race).
 *
 * The unique index on `nonce` still makes a replayed authorization fail (it throws).
 * A pending row older than PENDING_TTL_SECONDS no longer reserves anything, so a request
 * that died between the insert and its outcome cannot lock a payer out.
 */
export const PENDING_TTL_SECONDS = 180;

/** SQLite integers are 64-bit: a balance above this is clamped (it is far above any price). */
const MAX_INT = (1n << 62n) - 1n;

export const RESERVE_SQL = `INSERT INTO payments (id, listing_id, service_id, payer, pay_to, amount_atomic, nonce, status, request_path, created_at)
SELECT ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?
WHERE (
  SELECT coalesce(sum(cast(amount_atomic AS integer)), 0) FROM payments
  WHERE payer = ? AND status = 'pending' AND created_at >= ?
) + cast(? AS integer) <= cast(? AS integer)`;

export interface Reservation {
  id: string;
  listingId: string;
  serviceId: string;
  payer: string;
  payTo: string;
  amountAtomic: bigint;
  nonce: string;
  requestPath: string;
  /** The payer's USDG balance as read by the payment check. */
  balance: bigint;
  /** Unix seconds. */
  now: number;
}

/** Bind values for RESERVE_SQL, in order. Amounts travel as text: a JS number loses precision above 2^53. */
export function reserveParams(r: Reservation): Array<string | number> {
  const balance = r.balance > MAX_INT ? MAX_INT : r.balance;
  return [
    r.id, r.listingId, r.serviceId, r.payer, r.payTo, r.amountAtomic.toString(), r.nonce.toLowerCase(), r.requestPath, r.now,
    r.payer, r.now - PENDING_TTL_SECONDS, r.amountAtomic.toString(), balance.toString(),
  ];
}

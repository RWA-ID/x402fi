/**
 * A daily budget of settlements per payee on the public facilitator.
 *
 * x402Fi pays the gas of every settlement. The facilitator settles only to listed sellers,
 * but a listed seller could still pay their own payout wallet over and over at no cost to
 * themselves. A cap per payee and UTC day bounds what any one seller can make x402Fi spend.
 *
 * Taking a slot is one statement, so a burst of concurrent requests cannot pass the cap
 * (a read followed by a write would race). The gateway's own settlements are not counted.
 */
export const DEFAULT_DAILY_SETTLES = 200;

/** The cap from the FACILITATOR_DAILY_SETTLES var; anything unusable falls back to the default. */
export function dailySettleCap(raw: string | undefined): number {
  const n = raw && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
  return Number.isSafeInteger(n) && n >= 1 ? n : DEFAULT_DAILY_SETTLES;
}

/** Start of the UTC day, unix seconds. */
export function utcDay(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 86_400_000) * 86_400;
}

/** Takes one slot: changes 1 when taken, 0 when the payee is at its cap. Bind: payTo, day, cap. */
export const TAKE_SLOT_SQL = `INSERT INTO facilitator_settles (pay_to, day, count) VALUES (?, ?, 1)
ON CONFLICT (pay_to, day) DO UPDATE SET count = count + 1 WHERE count < ?`;

/** Gives a slot back when the settlement sent no transaction (no gas was spent). Bind: payTo, day. */
export const RELEASE_SLOT_SQL = `UPDATE facilitator_settles SET count = count - 1 WHERE pay_to = ? AND day = ? AND count > 0`;

/** Slots used today. Bind: payTo, day. */
export const SLOTS_USED_SQL = `SELECT count FROM facilitator_settles WHERE pay_to = ? AND day = ?`;

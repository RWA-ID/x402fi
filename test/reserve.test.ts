import { describe, it, expect, beforeEach } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PENDING_TTL_SECONDS, RESERVE_SQL, reserveParams, type Reservation } from "@/lib/gateway/reserve";

/** The real schema: every migration, in order, so the unique nonce index is the real one. */
function ledger() {
  const sqlite = new DatabaseSync(":memory:");
  const dir = join(__dirname, "..", "migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    for (const stmt of readFileSync(join(dir, f), "utf8").split("--> statement-breakpoint")) if (stmt.trim()) sqlite.exec(stmt);
  }
  // Foreign keys are enforced (as on D1), so the payment needs its seller, listing and endpoint.
  sqlite.exec(`INSERT INTO sellers (address, created_at) VALUES ('0x1111111111111111111111111111111111111111', 1794700000);
    INSERT INTO listings (id, slug, seller, name, summary, description, category, upstream_url, method, price_atomic, pay_to, upstream_secret, status, created_at, updated_at)
      VALUES ('l1', 'pinsvc', '0x1111111111111111111111111111111111111111', 'Pin', 't', 't', 'data', 'https://api.seller.example', 'POST', '10000', '0x1111111111111111111111111111111111111111', 'secret', 'live', 1794700000, 1794700000);
    INSERT INTO services (id, listing_id, name, summary, method, path, pricing, price_atomic, sort_order, status, created_at, updated_at)
      VALUES ('s1', 'l1', 'pin', '', 'POST', '/pin', 'fixed', '10000', 0, 'live', 1794700000, 1794700000);`);
  return sqlite;
}

const NOW = 1_800_000_000;
const A = "0xAaAaAaaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";
const B = "0xBbBbBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB";
let n = 0;
const res = (over: Partial<Reservation> = {}): Reservation => ({
  id: `p${++n}`, listingId: "l1", serviceId: "s1", payer: A, payTo: B, amountAtomic: 10_000n,
  nonce: "0x" + (n).toString(16).padStart(64, "0"), requestPath: "/pin", balance: 10_000n, now: NOW, ...over,
});

describe("reserving funds when the nonce is claimed", () => {
  let sqlite: DatabaseSync;
  const reserve = (r: Reservation) => Number(sqlite.prepare(RESERVE_SQL).run(...reserveParams(r)).changes);
  beforeEach(() => { sqlite = ledger(); });

  it("lets one balance back one call in flight, not five", () => {
    const got = [res(), res(), res(), res(), res()].map(reserve);
    expect(got).toEqual([1, 0, 0, 0, 0]);
    expect(sqlite.prepare("SELECT count(*) AS c FROM payments").get()).toEqual({ c: 1 });
  });
  it("lets as many calls in flight as the balance covers", () => {
    expect([res({ balance: 25_000n }), res({ balance: 25_000n }), res({ balance: 25_000n })].map(reserve)).toEqual([1, 1, 0]);
  });
  it("frees the funds when the call finishes, whatever its outcome", () => {
    for (const status of ["settled", "settle_failed", "upstream_failed"]) {
      const first = res();
      expect(reserve(first)).toBe(1);
      expect(reserve(res())).toBe(0);
      sqlite.prepare("UPDATE payments SET status = ? WHERE id = ?").run(status, first.id);
      const next = res();
      expect(reserve(next)).toBe(1);
      sqlite.prepare("UPDATE payments SET status = 'settled' WHERE id = ?").run(next.id);
    }
  });
  it("ignores a pending row that is too old to be a call in flight", () => {
    expect(reserve(res({ now: NOW - PENDING_TTL_SECONDS - 1 }))).toBe(1);
    expect(reserve(res())).toBe(1);
    expect(reserve(res())).toBe(0);
  });
  it("counts each payer on its own", () => {
    expect(reserve(res())).toBe(1);
    expect(reserve(res({ payer: B }))).toBe(1);
  });
  it("still refuses a replayed nonce, and stores it lower-cased", () => {
    const first = res({ nonce: "0x" + "AB".repeat(32), balance: 1_000_000n });
    expect(reserve(first)).toBe(1);
    expect(() => reserve(res({ nonce: "0x" + "ab".repeat(32), balance: 1_000_000n }))).toThrow(/UNIQUE/i);
    expect(sqlite.prepare("SELECT nonce, status, amount_atomic, created_at FROM payments WHERE id = ?").get(first.id))
      .toEqual({ nonce: "0x" + "ab".repeat(32), status: "pending", amount_atomic: "10000", created_at: NOW });
  });
  it("handles a balance larger than a 64-bit integer", () => {
    expect(reserve(res({ balance: 2n ** 200n }))).toBe(1);
  });
});

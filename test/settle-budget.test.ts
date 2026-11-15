import { describe, it, expect, beforeEach } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DEFAULT_DAILY_SETTLES, dailySettleCap, RELEASE_SLOT_SQL, SLOTS_USED_SQL, TAKE_SLOT_SQL, utcDay } from "@/lib/x402/settleBudget";

/** The real schema: every migration, in order. */
function ledger() {
  const sqlite = new DatabaseSync(":memory:");
  const dir = join(__dirname, "..", "migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    for (const stmt of readFileSync(join(dir, f), "utf8").split("--> statement-breakpoint")) if (stmt.trim()) sqlite.exec(stmt);
  }
  return sqlite;
}

const A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const DAY = utcDay(Date.UTC(2026, 10, 15, 13, 30));

describe("facilitator daily settle budget", () => {
  let sqlite: DatabaseSync;
  const take = (payTo: string, day: number, cap: number) => Number(sqlite.prepare(TAKE_SLOT_SQL).run(payTo, day, cap).changes);
  const used = (payTo: string, day: number) => (sqlite.prepare(SLOTS_USED_SQL).get(payTo, day) as { count: number } | undefined)?.count ?? 0;
  beforeEach(() => { sqlite = ledger(); });

  it("takes slots up to the cap and then refuses", () => {
    expect([take(A, DAY, 3), take(A, DAY, 3), take(A, DAY, 3), take(A, DAY, 3), take(A, DAY, 3)]).toEqual([1, 1, 1, 0, 0]);
    expect(used(A, DAY)).toBe(3);
  });
  it("counts each payee and each day on its own", () => {
    expect(take(A, DAY, 1)).toBe(1);
    expect(take(A, DAY, 1)).toBe(0);
    expect(take(B, DAY, 1)).toBe(1);
    expect(take(A, DAY + 86_400, 1)).toBe(1);
    expect(used(B, DAY + 86_400)).toBe(0);
  });
  it("gives a slot back when no transaction was sent, never below zero", () => {
    expect(take(A, DAY, 1)).toBe(1);
    sqlite.prepare(RELEASE_SLOT_SQL).run(A, DAY);
    expect(used(A, DAY)).toBe(0);
    sqlite.prepare(RELEASE_SLOT_SQL).run(A, DAY);
    expect(used(A, DAY)).toBe(0);
    expect(take(A, DAY, 1)).toBe(1);
  });
  it("starts the day at 00:00 UTC", () => {
    expect(DAY).toBe(Date.UTC(2026, 10, 15) / 1000);
    expect(utcDay(Date.UTC(2026, 10, 15, 23, 59, 59))).toBe(DAY);
    expect(utcDay(Date.UTC(2026, 10, 16))).toBe(DAY + 86_400);
  });
  it("reads the cap from the var, and falls back to the default on anything unusable", () => {
    expect(dailySettleCap("50")).toBe(50);
    expect(dailySettleCap(" 1000 ")).toBe(1000);
    for (const bad of [undefined, "", "0", "-5", "abc", "1.5", "1e3"]) expect(dailySettleCap(bad)).toBe(DEFAULT_DAILY_SETTLES);
  });
});

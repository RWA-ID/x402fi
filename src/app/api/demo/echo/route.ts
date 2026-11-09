/**
 * A tiny upstream used by the "Try it" demo listing and the wizard's sample.
 * Returns a market snapshot-style JSON so buyers see what a paid response looks like.
 */
export function GET(req: Request) {
  const u = new URL(req.url);
  const symbol = (u.searchParams.get("symbol") || "USDG").toUpperCase().slice(0, 10);
  return Response.json({
    symbol,
    message: "Paid response delivered by x402Fi. You paid in USDG on Robinhood Chain.",
    paidBy: req.headers.get("x-x402fi-payer"),
    servedAt: new Date().toISOString(),
  });
}

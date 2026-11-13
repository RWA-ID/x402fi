/**
 * Search over discovery-feed items for the MCP server. Pure (no DB, no network), so the
 * ranking is testable and the server stays a thin layer over the public feed.
 */

export interface SearchableItem {
  resource: string;
  description?: string;
  serviceName?: string;
  tags?: string[];
  accepts: Array<{ amount: string }>;
  metadata: { name: string; category: string; payeeName?: string | null };
}

export interface SearchInput {
  query?: string;
  category?: string;
  maxPriceAtomic?: bigint;
  limit: number;
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9.]+/).filter((w) => w.length > 1);

/**
 * Every query word must appear somewhere in the item (name, service, category, tags,
 * description, payee name, URL). Ranked by where the words hit: name > category/tags >
 * description, then cheapest first. No query lists everything, cheapest first.
 */
export function searchItems<T extends SearchableItem>(items: T[], q: SearchInput): T[] {
  const terms = words(q.query ?? "");
  const cat = q.category?.trim().toLowerCase();
  const scored: Array<{ item: T; score: number; price: bigint }> = [];
  for (const item of items) {
    const price = BigInt(item.accepts[0]?.amount ?? "0");
    if (q.maxPriceAtomic !== undefined && price > q.maxPriceAtomic) continue;
    if (cat && item.metadata.category.toLowerCase() !== cat) continue;
    const name = `${item.metadata.name} ${item.serviceName ?? ""}`.toLowerCase();
    const topical = `${item.metadata.category} ${(item.tags ?? []).join(" ")}`.toLowerCase();
    const rest = `${item.description ?? ""} ${item.metadata.payeeName ?? ""} ${item.resource}`.toLowerCase();
    let score = 0;
    let all = true;
    for (const t of terms) {
      if (name.includes(t)) score += 3;
      else if (topical.includes(t)) score += 2;
      else if (rest.includes(t)) score += 1;
      else { all = false; break; }
    }
    if (all) scored.push({ item, score, price });
  }
  scored.sort((a, b) => b.score - a.score || (a.price < b.price ? -1 : a.price > b.price ? 1 : 0));
  return scored.slice(0, q.limit).map((s) => s.item);
}

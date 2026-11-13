/**
 * The x402 Bazaar discovery extension (`extensions.bazaar`): tells an agent HOW to call
 * an endpoint, not only what it costs. Built from what the seller already entered (method,
 * path, example request/body/response), in the shape the official SDKs validate:
 * https://github.com/coinbase/x402/blob/main/docs/extensions/bazaar.mdx
 *
 * Pure: used by the gateway's 402 and by the discovery feed, so both say the same thing.
 */

const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

export interface BazaarEndpoint {
  method: string;
  /** Service path prefix under the listing, e.g. "/v1/preflight" or "/". */
  path: string;
  pricing: string;
  exampleRequest: string | null;
  exampleBody: string | null;
  exampleResponse: string | null;
}

export interface BazaarExtension {
  info: {
    input: {
      type: "http";
      method: string;
      queryParams?: Record<string, string>;
      pathParams?: Record<string, string>;
      bodyType?: "json";
      body?: Record<string, unknown>;
    };
    output?: { type: "json"; example: unknown };
  };
  /** Absolute path with `:param` segments, for endpoints whose URL carries a value. */
  routeTemplate?: string;
  schema: Record<string, unknown>;
}

/**
 * Splits a seller's example into the extra path and the query. Sellers write it as
 * "?symbol=AAPL", "/register/yourname", "/owner/0x…/names?x=1", or even a bare
 * "token=0x…" (no "?"), which is read as a query, never as a path segment.
 */
export function parseExample(path: string, example: string | null): { subPath: string; query: Record<string, string> } {
  const ex = (example ?? "").trim();
  if (!ex) return { subPath: "", query: {} };
  let pathPart: string;
  let queryPart: string;
  if (ex.startsWith("?")) [pathPart, queryPart] = ["", ex.slice(1)];
  else if (!ex.includes("/") && ex.includes("=")) [pathPart, queryPart] = ["", ex];
  else {
    const i = ex.indexOf("?");
    [pathPart, queryPart] = i === -1 ? [ex, ""] : [ex.slice(0, i), ex.slice(i + 1)];
  }
  if (pathPart && !pathPart.startsWith("/")) pathPart = "/" + pathPart;
  // An example that repeats the endpoint's own path keeps only what follows it.
  const base = path === "/" ? "" : path;
  if (base && (pathPart === base || pathPart.startsWith(base + "/"))) pathPart = pathPart.slice(base.length);
  const query: Record<string, string> = {};
  if (queryPart) new URLSearchParams(queryPart).forEach((v, k) => { query[k] = v; });
  return { subPath: pathPart, query };
}

function parseJsonObject(text: string | null): Record<string, unknown> | null {
  if (!text?.trim()) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function parseJson(text: string | null): { ok: true; value: unknown } | { ok: false } {
  if (!text?.trim()) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

const stringProps = (o: Record<string, string>) =>
  Object.fromEntries(Object.keys(o).map((k) => [k, { type: "string" }]));

/**
 * The bazaar extension for one endpoint. `resourcePath` is the absolute URL path the
 * buyer calls (e.g. "/g/stockfi-trade/v1/preflight"), used for a contract endpoint's
 * routeTemplate ("/g/hoodfi-names/register/:name").
 */
export function bazaarExtension(ep: BazaarEndpoint, resourcePath: string): BazaarExtension {
  const method = ep.method.toUpperCase();
  const { subPath, query } = parseExample(ep.path, ep.exampleRequest);
  const input: BazaarExtension["info"]["input"] = { type: "http", method };
  const inputProps: Record<string, unknown> = {
    type: { type: "string", const: "http" },
    method: { type: "string", enum: [method] },
  };
  const required = ["type", "method"];

  if (Object.keys(query).length) {
    input.queryParams = query;
    inputProps.queryParams = { type: "object", properties: stringProps(query) };
  }

  let routeTemplate: string | undefined;
  // A contract endpoint is priced and settled per label, which is the next path segment.
  if (ep.pricing === "contract") {
    const label = subPath.split("/").filter(Boolean)[0] || "yourname";
    input.pathParams = { name: label };
    inputProps.pathParams = { type: "object", properties: { name: { type: "string", description: "The label to register" } }, required: ["name"] };
    routeTemplate = `${resourcePath.replace(/\/$/, "")}/:name`;
  }

  if (BODY_METHODS.has(method)) {
    input.bodyType = "json";
    input.body = parseJsonObject(ep.exampleBody) ?? {};
    inputProps.bodyType = { type: "string", enum: ["json"] };
    inputProps.body = { type: "object" };
    required.push("bodyType", "body");
  }

  const info: BazaarExtension["info"] = { input };
  const out = parseJson(ep.exampleResponse);
  if (out.ok) info.output = { type: "json", example: out.value };

  const schema: Record<string, unknown> = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {
      input: { type: "object", properties: inputProps, required },
      ...(info.output ? { output: { type: "object" } } : {}),
    },
    required: ["input"],
  };

  return { info, ...(routeTemplate ? { routeTemplate } : {}), schema };
}

/** Accepts a seller's own bazaar declaration (native endpoints) only if it has the required shape. */
export function isBazaarExtension(v: unknown): v is BazaarExtension {
  const b = v as { info?: { input?: { type?: unknown } }; schema?: unknown } | null;
  return !!b && typeof b === "object" && b.info?.input?.type === "http" && !!b.schema && typeof b.schema === "object";
}

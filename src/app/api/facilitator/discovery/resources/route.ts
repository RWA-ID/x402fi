/**
 * The official x402 SDKs query `{facilitatorUrl}/discovery/resources`, so a client set up
 * with x402Fi's facilitator (https://x402fi.dev/api/facilitator) finds the feed here too.
 */
export { GET } from "@/app/api/discovery/resources/route";
export const dynamic = "force-dynamic";

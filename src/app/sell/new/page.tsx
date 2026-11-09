import type { Metadata } from "next";
import { Wizard } from "./Wizard";

export const metadata: Metadata = { title: "List a service", description: "Put a per-call price in USDG on any API. Free to list." };

export default function SellNew() {
  return <Wizard />;
}

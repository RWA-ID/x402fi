import type { Metadata } from "next";
import { Dashboard } from "./Dashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default function Page() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6">
      <Dashboard />
    </div>
  );
}

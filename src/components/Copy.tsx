"use client";
import { useState } from "react";

export function Copy({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="mt-2 flex gap-2">
        <code className="field flex-1 overflow-x-auto whitespace-nowrap">{value}</code>
        <button className="btn btn-ghost" onClick={async () => { await navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 1500); }}>{ok ? "Copied" : "Copy"}</button>
      </div>
      {hint && <p className="mt-1.5 text-sm text-ink-3">{hint}</p>}
    </div>
  );
}

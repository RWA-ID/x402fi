"use client";
export function PrintButton() {
  return <button onClick={() => window.print()} className="btn btn-ghost mt-6 print:hidden">Print or save as PDF</button>;
}

"use client";
import { useState } from "react";

/** Ready-to-post copy for X: open X's composer prefilled with it, or copy just the link. */
export function ShareOnX({ text, url, intent }: { text: string; url: string; intent: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="card p-6">
      <div className="eyebrow">Share on X</div>
      <p className="mt-3 whitespace-pre-line break-words rounded-lg bg-elev p-3 text-sm text-ink-2">
        {text}
        {"\n"}
        <span className="break-all text-ink-3">{url}</span>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a className="btn btn-primary" href={intent} target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          Post on X
        </a>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard blocked: the text is still selectable above */
            }
          }}
        >
          {copied ? "Link copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}

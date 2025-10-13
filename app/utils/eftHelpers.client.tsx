// Helpers spécifiques au client (JSX)
import React from "react";

export function renderPretty(s: string) {
  const cleanText = s.replace(/^Étape\s*\d+\s*[—-]\s*/i, "");
  const paragraphs = cleanText.split(/\n\s*\n/);

  const bulletRx = /^\s*(?:-|\*|•)\s+/;
  const orderedRx = /^\s*\d+[\.\)]\s+/;

  return (
    <div className="space-y-3">
      {paragraphs.map((p, i) => {
        const lines = p.split(/\n/).map(t => t.trim()).filter(Boolean);

        if (lines.length >= 2 && lines.every(l => bulletRx.test(l))) {
          const items = lines.map(l => l.replace(bulletRx, ""));
          return (
            <ul key={i} className="list-disc pl-5 space-y-1">
              {items.map((li, j) => <li key={j} className="whitespace-pre-wrap">{li}</li>)}
            </ul>
          );
        }

        if (lines.length >= 2 && lines.every(l => orderedRx.test(l))) {
          const items = lines.map(l => l.replace(orderedRx, ""));
          return (
            <ol key={i} className="list-decimal pl-5 space-y-1">
              {items.map((li, j) => <li key={j} className="whitespace-pre-wrap">{li}</li>)}
            </ol>
          );
        }

        return <p key={i} className="whitespace-pre-line leading-relaxed">{p}</p>;
      })}
    </div>
  );
}

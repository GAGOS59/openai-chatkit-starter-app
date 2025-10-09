"use client";
import React, { useRef, useState, useEffect, FormEvent } from "react";


type Row = { who: "bot" | "user"; text: string };


export default function Page() {
const [rows, setRows] = useState<Row[]>([
{ who: "bot", text: "Bonjour et bienvenue. Comment puis-je t'aider aujourd'hui ?" },
]);
const [text, setText] = useState("");
const chatRef = useRef<HTMLDivElement>(null);


function onSubmit(e: FormEvent) {
e.preventDefault();
if (!text.trim()) return;
setRows((r) => [...r, { who: "user", text }]);
setText("");
}


useEffect(() => {
if (chatRef.current) {
chatRef.current.scrollTop = chatRef.current.scrollHeight;
}
}, [rows]);


return (
<main className="mx-auto max-w-3xl p-6 space-y-4">
<h1 className="text-2xl font-semibold">Guide EFT – Démo</h1>


<div ref={chatRef} className="h-96 overflow-y-auto rounded-lg border p-4 bg-white">
<div className="space-y-3">
{rows.map((r, i) => (
<div key={i} className={r.who === "bot" ? "flex" : "flex justify-end"}>
<div
className={
(r.who === "bot"
? "bg-gray-50 text-gray-900"
: "bg-blue-50 text-blue-900 border-blue-200") +
" max-w-[80%] rounded-xl border px-3 py-2 leading-relaxed shadow-sm"
}
>
{r.text.split("\n").map((line, idx) => (
<p key={idx} className="whitespace-pre-wrap">
{line}
</p>
))}
</div>
</div>
))}
</div>
</div>


<form onSubmit={onSubmit} className="flex gap-2">
<input
value={text}
onChange={(e) => setText(e.target.value)}
className="flex-1 rounded border px-3 py-2"
placeholder="Pose ta question sur l'EFT..."
/>
<button type="submit" className="rounded border px-4 py-2">Envoyer</button>
</form>
</main>
);
}

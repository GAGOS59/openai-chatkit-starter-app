"use client";
async function onSubmit(e: React.FormEvent) {
e.preventDefault();
if (!text.trim()) return;


const userMsg = text;
setText("");
setRows((r) => [...r, { who: "user", text: userMsg }]);


try {
const res = await fetch("/api/guide-eft", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ prompt: userMsg }),
});


if (!res.ok) {
const detail = await res.text();
setRows((r) => [
...r,
{
who: "bot",
text:
"Oups — le serveur a répondu en erreur. Réessaie dans un instant.\n" +
detail,
},
]);
return;
}


const data = await res.json();
setRows((r) => [
...r,
{ who: "bot", text: data.answer ?? String(data.message ?? "") },
]);
} catch (err: any) {
setRows((r) => [
...r,
{ who: "bot", text: "Erreur réseau inattendue : " + String(err) },
]);
}
}


useEffect(() => {
chatRef.current?.scrollTo(0, chatRef.current.scrollHeight);
}, [rows]);


return (
<main className="p-6 max-w-3xl mx-auto space-y-4">
<h1 className="text-2xl font-semibold">Guide EFT – Démo</h1>


<div
ref={chatRef}
className="border rounded-lg p-4 h-96 overflow-y-auto space-y-2"
>
{rows.map((r, i) => (
<div key={i} className={r.who === "bot" ? "bg-gray-50 p-2 rounded" : "text-right"}>
<p>{r.text}</p>
</div>
))}
</div>


<form onSubmit={onSubmit} className="flex gap-2">
<input
value={text}
onChange={(e) => setText(e.target.value)}
className="flex-1 border rounded px-3 py-2"
placeholder={"Pose ta question sur l'EFT..."}
/>
<button type="submit" className="border rounded px-4 py-2">
Envoyer
</button>
</form>
</main>
);
}

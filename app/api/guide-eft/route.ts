import { NextResponse } from "next/server";


export async function POST(req: Request) {
try {
const { prompt } = await req.json();


const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
return NextResponse.json(
{ error: "Missing OPENAI_API_KEY" },
{ status: 500 }
);
}


const res = await fetch("https://api.openai.com/v1/responses", {
method: "POST",
headers: {
"Content-Type": "application/json",
Authorization: `Bearer ${apiKey}`,
},
body: JSON.stringify({
model: "gpt-4o-mini",
input:
"Réponds en français de façon claire, concise et professionnelle comme assistante EFT.\nQuestion: " +
String(prompt ?? ""),
}),
});


if (!res.ok) {
const detail = await res.text();
return NextResponse.json(
{ error: "Server error", detail },
{ status: 500 }
);
}


const json = await res.json();
const answer =
json?.output?.[0]?.content?.[0]?.text ??
json?.choices?.[0]?.message?.content ??
json?.content?.[0]?.text ??
"";


return NextResponse.json({ answer });
} catch (err: any) {
return NextResponse.json(
{ error: "Server error", detail: String(err?.message ?? err) },
{ status: 500 }
);
}
}

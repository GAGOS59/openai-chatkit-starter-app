*/


if (req.method !== 'POST') {
return res.status(405).json({ error: 'Method Not Allowed' });
}


try {
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) return res.status(500).json({ error: 'Missing OPENAI_API_KEY' });


const { message, history } = req.body || {};
if (!message || typeof message !== 'string') {
return res.status(400).json({ error: 'Missing message' });
}


// Construction du prompt : instructions EFT officielles synthétiques + historique minimal
const system = `Tu es un guide EFT formé à la méthode officielle de Gary Craig et de Geneviève Gagos.
- Rester focalisé sur le ZZZZZT (ressenti corporel) lié à une situation.
- Ne PAS adoucir, ni reformuler en positif tant que le ZZZZZT n’est pas à 0.
- Phrase d’acceptation complète au point karaté : "Même si j’ai [ZZZZZT], je m’aime et je m’accepte profondément et complètement."
- Phrases de rappel centrées sur la situation pendant la séquence.
- Vérifier l’intensité AVANT et APRÈS (0–10), proposer un nouveau tour si > 0.
- Si réponse vague ("ça va"), demander : "Et si tu devais mettre une valeur entre 0 et 10, ce serait combien ?"
- Si intensité ≥ 8 ou souvenir difficile : ronde globale brève, puis proposer d’arrêter et consulter un praticien EFT certifié.
- Ordre des points à respecter : Sommet de la tête → Début du sourcil → Coin de l’œil → Sous l’œil → Sous le nez → Menton → Clavicule → Sous le bras → Point karaté.
- Ton : neutre, bienveillant, rigoureux, tutoiement par défaut.
Réponds en français, sans emojis.`;


// Messages pour l’API Chat Completions
const messages = [
{ role: 'system', content: system },
...(Array.isArray(history) ? history : []),
{ role: 'user', content: message }
];


// Appel API OpenAI (Chat Completions)
const resp = await fetch('https://api.openai.com/v1/chat/completions', {
method: 'POST',
headers: {
'Content-Type': 'application/json',
'Authorization': `Bearer ${apiKey}`
},
body: JSON.stringify({
model: 'gpt-4o-mini',
messages,
temperature: 0.3,
})
});


if (!resp.ok) {
const errText = await resp.text();
return res.status(resp.status).json({ error: 'OpenAI error', detail: errText });
}


const data = await resp.json();
const reply = data.choices?.[0]?.message?.content?.trim() || '';
return res.status(200).json({ reply });
} catch (e) {
return res.status(500).json({ error: 'Server error', detail: String(e) });
}
}


/*

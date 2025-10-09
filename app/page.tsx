'use client';
import { useRef, useState } from 'react';

type Row = { who: 'me' | 'bot'; text: string };
type ChatTurn = { role: 'user' | 'assistant'; content: string };

export default function Page() {
  const [rows, setRows] = useState<Row[]>([
    { who: 'bot', text: 'Bonjour, comment puis-je t aider aujourd hui ?' },
  ]);
  const [text, setText] = useState<string>('');
  const chatRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<ChatTurn[]>([]);

  const add = (who: Row['who'], t: string) => {
    setRows((r) => [...r, { who, text: t }]);
    setTimeout(() => {
      chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
    }, 10);
  };

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    add('me', t);
    setText('');

    try {
      const resp = await fetch('/api/guide-eft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: t, history: historyRef.current }),
      });

      const data: { reply?: string; error?: string } = await resp.json();

      if (!resp.ok) {
        add('bot', 'Une erreur est survenue. Merci de réessayer plus tard.');
        console.error('API error', data);
        return;
      }

      const reply = (data.reply ?? '(aucune réponse)').trim();
      add('bot', reply);
      historyRef.current.push({ role: 'user', content: t });
      historyRef.current.push({ role: 'assistant', content: reply });
    } catch (e) {
      add('bot', 'Impossible de contacter le serveur pour le moment.');
      console.error(e);
    }
  };

  return (
    <main
      style={{
        background: '#F3EEE6',
        color: '#0F3D69',
        minHeight: '100vh',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
        padding: '40px 12px',
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: '0 auto',
          background: '#fff',
          border: '1px solid #0F3D69',
          borderRadius: 16,
          boxShadow: '0 6px 24px rgba(0,0,0,.08)',
          overflow: 'hidden',
        }}
      >
        
        <header style={{ padding: 20, borderBottom: '1px solid #0F3D69' }}>
          <header className="flex items-center justify-between border-b pb-2 mb-4">
  <div>
    <h1 className="text-2xl font-semibold text-[#0f3d69]">
      Guide EFT – École EFT France
    </h1>
    <p className="text-sm text-gray-600">
      Ce guide créé par Geneviève Gagos applique l’EFT officielle.
    </p>
  </div>

  <img
    src="https://ecole-eft-france.fr/assets/front/logo-a8701fa15e57e02bbd8f53cf7a5de54b.png"
    alt="Logo École EFT France"
    className="h-10 w-auto"
  />
</header>

        </header>

        <div ref={chatRef} style={{ height: 520, overflowY: 'auto', padding: 16, background: '#fff' }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div
                style={{
                  maxWidth: '80%',
                  padding: '12px 14px',
                  borderRadius: 14,
                  lineHeight: 1.45,
                  fontSize: 16,
                  marginLeft: r.who === 'me' ? 'auto' : undefined,
                  marginRight: r.who === 'bot' ? 'auto' : undefined,
                  background: r.who === 'me' ? '#0F3D69' : '#F3EEE6',
                  color: r.who === 'me' ? '#fff' : '#0F3D69',
                  borderBottomRightRadius: r.who === 'me' ? 4 : 14,
                  borderBottomLeftRadius: r.who === 'bot' ? 4 : 14,
                  border: r.who === 'bot' ? '1px solid #0F3D69' : 'none',
                }}
              >
               <p className="whitespace-pre-line leading-relaxed">{r.text}</p>

              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, borderTop: '1px solid #0F3D69', padding: 12, background: '#fff' }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send();
            }}
            placeholder="Votre message…"
            style={{ flex: 1, padding: 12, border: '1px solid #0F3D69', borderRadius: 10, fontSize: 16, color: '#0F3D69' }}
          />
          <button
            onClick={send}
            style={{
              padding: '12px 16px',
              background: '#0F3D69',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontSize: 16,
              cursor: 'pointer',
            }}
          >
            Envoyer
          </button>
        </div>
      </div>

     <div
  style={{
    backgroundColor: "#F3EEE6",
    color: "#0f3d69",
    border: "1px solid #d9d5ce",
    borderRadius: "12px",
    padding: "14px 18px",
    fontSize: "14px",
    lineHeight: "1.6",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    marginTop: "20px",
  }}
>
  <strong style={{ display: "block", fontSize: "15px", marginBottom: "6px" }}>
    Note de prudence
  </strong>
  <p>
    Ce guide est proposé à titre informatif et éducatif. Il ne remplace en
    aucun cas un avis médical, psychologique ou professionnel.
  </p>
  <p>
    L’École EFT France et ses représentants déclinent toute responsabilité quant
    à l’interprétation, l’usage ou les conséquences liés à l’application des
    informations ou protocoles présentés. Chaque utilisateur reste responsable
    de sa pratique et de ses choix.
  </p>
  <p>
    En cas de doute, de détresse émotionnelle ou de trouble persistant, il est
    vivement recommandé de consulter un professionnel de santé.
  </p>
</div>


    </main>
  );
}

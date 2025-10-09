'use client';
import { useRef, useState } from 'react';

type Row = { who: 'me' | 'bot'; text: string };
type ChatTurn = { role: 'user' | 'assistant'; content: string };

export default function Page() {
  const [rows, setRows] = useState<Row[]>([
    { who: 'bot', text: 'Bonjour et bienvenue. Comment puis-je t aider maintenant ?' },
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
          <h1 style={{ margin: 0, fontSize: 22 }}>Guide EFT – École EFT France</h1>
          <p style={{ margin: '6px 0 0 0', fontSize: 14, opacity: 0.85 }}>
            Ce guide créé par Geneviève Gagos applique l’EFT officielle.
          </p>
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
                {r.text}
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

      <p style={{ fontSize: 14, margin: '16px 0', maxWidth: 720, marginInline: 'auto' }}>
        En cas de difficulté ou d’intensité élevée, interrompez la séance et contactez un praticien EFT certifié.
      </p>
    </main>
  );
}

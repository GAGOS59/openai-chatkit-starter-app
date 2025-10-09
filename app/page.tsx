// app/page.tsx — version complète avec rendu lisible des réponses (listes + sauts de ligne)

'use client';
import { useRef, useState } from 'react';

type Row = { who: 'me' | 'bot'; text: string };
type ChatTurn = { role: 'user' | 'assistant'; content: string };

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function toHtml(raw: string) {
  const txt = raw.replace(/\r\n?/g, '\n').trim();
  const lines = txt.split(/\n/);
  const isOL = lines.every((l) => /^\s*\d+\.\s+/.test(l) || l.trim() === '');
  const isUL = !isOL && lines.every((l) => /^\s*[-*•]\s+/.test(l) || l.trim() === '');

  if (isOL) {
    const items = lines
      .filter((l) => l.trim() !== '')
      .map((l) => escapeHtml(l.replace(/^\s*\d+\.\s+/, '')))
      .map((li) => `<li>${li}</li>`) 
      .join('');
    return `<ol>${items}</ol>`;
  }
  if (isUL) {
    const items = lines
      .filter((l) => l.trim() !== '')
      .map((l) => escapeHtml(l.replace(/^\s*[-*•]\s+/, '')))
      .map((li) => `<li>${li}</li>`) 
      .join('');
    return `<ul>${items}</ul>`;
  }

  const paras = txt.split(/\n\n+/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`);
  return paras.join('');
}

export default function Page() {
  const [rows, setRows] = useState<Row[]>([
    { who: 'bot', text: 'Bonjour et bienvenue. Comment puis-je t'aider aujourd'hui ?' },
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
           Ce guide créé par Geneviève Gagos) applique l’EFT officielle.
          </p>
        </header>

        <div ref={chatRef} style={{ height: 520, overflowY: 'auto', padding: 16, background: '#fff' }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              {r.who === 'me' ? (
                <div
                  style={{
                    maxWidth: '80%',
                    padding: '12px 14px',
                    borderRadius: 14,
                    lineHeight: 1.45,
                    fontSize: 16,
                    marginLeft: 'auto',
                    background: '#0F3D69',
                    color: '#fff',
                    borderBottomRightRadius: 4,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {r.text}
                </div>
              ) : (
                <div
                  style={{
                    maxWidth: '80%',
                    padding: '12px 14px',
                    borderRadius: 14,
                    lineHeight: 1.45,
                    fontSize: 16,
                    marginRight: 'auto',
                    background: '#F3EEE6',
                    color: '#0F3D69',
                    borderBottomLeftRadius: 4,
                    border: '1px solid #0F3D69',
                  }}
                  dangerouslySetInnerHTML={{ __html: toHtml(r.text) }}
                />
              )}
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

      <p style={{ fontSize: 16, margin: '16px 0', maxWidth: 720, marginInline: 'auto' }}>
        En cas de difficulté ou d’intensité élevée, interrompez la séance et contactez un praticien EFT certifié.
      </p>
    </main>
  );
}

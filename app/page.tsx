return (
  <main className="mx-auto max-w-6xl p-6">
    {/* Bandeau */}
    <div className="rounded-2xl border bg-[#F3EEE6] text-[#0f3d69] p-4 shadow-sm mb-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs tracking-wide uppercase opacity-80">Édition spéciale</p>
          <h1 className="text-xl sm:text-2xl font-semibold">30 ans d&apos;EFT — 1995 → 2025</h1>
          <p className="text-sm mt-1 opacity-90">
            Une pratique de libération émotionnelle transmise avec rigueur et bienveillance.
          </p>
        </div>
        <Image
          src="https://ecole-eft-france.fr/assets/front/logo-a8701fa15e57e02bbd8f53cf7a5de54b.png"
          alt="Logo École EFT France"
          width={160}
          height={40}
          className="h-10 w-auto"
          priority
        />
      </div>
    </div>

    {/* grille : chat + sidebar */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Colonne gauche : chat */}
      <div className="md:col-span-2 space-y-6">
        {/* Sécurité crise */}
        {crisisMode !== "none" && (
          <div className="rounded-xl border bg-[#fff5f5] text-[#7a1f1f] p-4 shadow-sm space-y-2">
            <strong className="block">Message important</strong>
            <p className="text-sm">
              Il semble que tu traverses un moment très difficile. Je te prends au sérieux.
              Je ne peux pas t’accompagner avec l’EFT dans une situation d’urgence : ta sécurité est prioritaire.
            </p>
            <p className="text-sm">
              <span className="font-semibold">📞 En France :</span><br />
              • 3114 — Prévention du suicide (gratuit, 24/7)<br />
              • 15 — SAMU<br />
              • 112 — Urgences (si danger immédiat)
            </p>
            {crisisMode === "ask" && (
              <p className="text-sm">
                Avant toute chose, as-tu des idées suicidaires en ce moment ? (réponds par <strong>oui</strong> ou <strong>non</strong>)
              </p>
            )}
            {crisisMode === "lock" && (
              <p className="text-sm">
                Ta sécurité est prioritaire. Je ne poursuivrai pas l’EFT dans cette situation.
              </p>
            )}
          </div>
        )}

        {/* Zone de chat */}
        <div
          ref={chatRef}
          className="h-[60vh] overflow-y-auto rounded-2xl border bg-white p-4 shadow-sm"
        >
          <div className="space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "assistant" ? "flex" : "flex justify-end"}>
                <div
                  className={
                    (m.role === "assistant"
                      ? "bg-gray-50 text-gray-900 border-gray-200"
                      : "bg-blue-50 text-blue-900 border-blue-200") +
                    " max-w-[80%] whitespace-pre-wrap rounded-2xl border px-4 py-3 shadow-sm"
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex">
                <div className="bg-gray-50 text-gray-900 border-gray-200 rounded-2xl border px-4 py-3 shadow-sm">
                  … je réfléchis
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Formulaire */}
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 rounded-xl border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 shadow-sm"
              placeholder="Écris ici… (ex. « J’ai mal au genou », « Je me sens anxieuse », …)"
              aria-label="Saisis ton message"
              disabled={loading || crisisMode === "lock"}
            />
            <button
              type="submit"
              disabled={loading || !input.trim() || crisisMode === "lock"}
              className="rounded-xl border px-4 py-2 shadow-sm bg-white hover:bg-gray-50 active:scale-[0.99]"
            >
              {loading ? "Envoi..." : "Envoyer"}
            </button>
          </div>

          {crisisMode === "ask" && (
            <p className="text-sm text-[#0f3d69] opacity-80">
              Réponds simplement par <strong>oui</strong> ou <strong>non</strong>, s’il te plaît.
            </p>
          )}
        </form>

        {/* Alerte/erreur */}
        {error && <div className="text-red-600">{error}</div>}

        {/* Note de prudence */}
        <div className="rounded-xl border bg-[#F3EEE6] text-[#0f3d69] p-4 shadow-sm mb-2">
          <strong className="block mb-1">Note de prudence</strong>
          <p className="text-sm leading-relaxed">
            Ce guide est proposé à titre informatif et éducatif. Il ne remplace en aucun cas un avis médical,
            psychologique ou professionnel.<br />
            L&apos;École EFT France et ses représentants déclinent toute responsabilité quant à l&apos;interprétation,
            l&apos;usage ou les conséquences liés à l&apos;application des informations ou protocoles présentés.<br />
            Chaque utilisateur reste responsable de sa pratique et de ses choix.
            <br /><br />
            <strong>Important :</strong> L&apos;École EFT France ou Geneviève Gagos ne voit pas et n&apos;enregistre pas
            vos échanges réalisés dans ce chat. Mais comme pour tout ce qui transite par Internet, nous vous invitons
            à rester prudents et à ne pas divulguer d&apos;éléments très personnels.
          </p>
          <p className="text-xs mt-3 opacity-80">
            — Édition spéciale 30 ans d&apos;EFT — © 2025 École EFT France — Direction Geneviève Gagos
          </p>
        </div>

        {/* Toast */}
        <div
          aria-live="assertive"
          className="pointer-events-none fixed inset-0 flex items-end px-4 py-6 sm:items-start sm:p-6 z-50"
        >
          <div className="flex w-full flex-col items-center space-y-4 sm:items-end">
            {toast && (
              <div
                key={toast.key}
                role="status"
                className="pointer-events-auto w-full sm:w-auto max-w-sm overflow-hidden rounded-xl border bg-white/95 backdrop-blur shadow-lg ring-1 ring-black/5"
              >
                <div className="p-4">
                  <p className="text-sm text-gray-900">{toast.msg}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Boutons urgence flottants */}
        {crisisMode !== "none" && (
          <div
            aria-label="Accès rapide urgence"
            className="fixed bottom-20 right-4 z-50 flex flex-col gap-2"
          >
            <a href="tel:3114" className="rounded-full bg-[#7a1f1f] text-white px-5 py-3 text-sm shadow-lg hover:opacity-90 transition">📞 3114 — Prévention du suicide (24/7)</a>
            <a href="tel:112" className="rounded-full bg-[#7a1f1f] text-white px-5 py-3 text-sm shadow-lg hover:opacity-90 transition">🚨 112 — Urgences</a>
            <a href="tel:15" className="rounded-full bg-[#7a1f1f] text-white px-5 py-3 text-sm shadow-lg hover:opacity-90 transition">🏥 15 — SAMU</a>
          </div>
        )}
      </div>

      {/* Colonne droite : promo + AYNI (sticky) */}
      <div className="md:col-span-1">
        <div className="md:sticky md:top-6 flex flex-col gap-6">
          <PromoCard />
          <div className="mt-2" />
          <AyniCard />
        </div>
      </div>
    </div>
  </main>
);


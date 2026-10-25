/* Ventana inicial de intercambio. Aún no envía ofertas a otros jugadores. */
G.TradeUI = (() => {
  let root = null;
  function close() { if (root) root.remove(); root = null; }
  function open() {
    close();
    if (!G.DB?.save) return alert('Primero debes iniciar sesión.');
    if (G.DB.guest) return alert('El intercambio requiere una cuenta, no el modo invitado.');
    root = document.createElement('div');
    root.className = 'scr dim'; root.id = 'trade-modal'; root.style.zIndex = '10000';
    root.innerHTML = `
      <div class="box wide" role="dialog" aria-modal="true">
        <div class="row between" style="align-items:center">
          <h2>Intercambiar con amigos</h2>
          <button class="btn ghost" data-close aria-label="Cerrar">✕</button>
        </div>
        <p class="sub">Prepara una oferta de Coins y Pokémon.</p>
        <label for="trade-friend">Amigo</label>
        <select id="trade-friend" class="field"><option value="">Lista de amigos aún no conectada</option></select>
        <label for="trade-coins">Coins que ofreces</label>
        <input id="trade-coins" class="field" type="number" min="0" step="1" value="0">
        <label for="trade-pokemon">Pokémon que ofreces (opcional)</label>
        <select id="trade-pokemon" class="field"><option value="">No ofrecer Pokémon</option></select>
        <p id="trade-status" class="note" aria-live="polite">Todavía no se enviarán ofertas.</p>
        <div class="row between" style="margin-top:12px">
          <button class="btn ghost" data-close>Cancelar</button>
          <button class="btn gold" id="trade-preview">Validar oferta</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
    root.addEventListener('click', e => { if (e.target === root) close(); });
    const sel = root.querySelector('#trade-pokemon');
    Object.keys(G.DB.save.owned || {}).forEach(key => {
      const dex = Number(key), mon = G.DEX_BY[dex];
      if (!mon) return;
      const opt = document.createElement('option');
      opt.value = String(dex); opt.textContent = `${mon.name} (#${dex})`; sel.appendChild(opt);
    });
    const friend = root.querySelector('#trade-friend');
    friend.disabled = true;
    root.querySelector('#trade-preview').addEventListener('click', () => {
      const status = root.querySelector('#trade-status');
      try {
        if (!friend.value) throw new Error('La lista de amigos aún no está conectada.');
        const offer = G.Trade.createOffer({
          fromUid: G.Net?.uid, toUid: friend.value,
          coins: root.querySelector('#trade-coins').value,
          pokemonDex: sel.value || null
        });
        G.Trade.validateAgainstSave(offer);
        status.textContent = 'Oferta válida. Falta conectar el envío seguro.';
      } catch (e) { status.textContent = e?.message || 'No se pudo validar la oferta.'; }
    });
  }
  return { open, close };
})();

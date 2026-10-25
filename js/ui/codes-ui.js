/* ============ codes-ui.js — canje de recompensas ============ */
G.CodesUI = (() => {
  const $ = G.UI.$, MAX = 999999999;
  const activeKey = email => 'ps.admin.mode.' + email.toLowerCase();
  function adminEmail() { return ((G.REDEEM_CODES && G.REDEEM_CODES.adminEmail) || '').toLowerCase(); }
  function isAdminAccount() {
    const fb = G.DB.fb;
    const current = fb && fb.auth && fb.auth.currentUser;
    const email = current && current.email;
    return !!(email && current.emailVerified && email.toLowerCase() === adminEmail());
  }
  function isAdminMode() {
    if (!isAdminAccount()) return false;
    try { return localStorage.getItem(activeKey(adminEmail())) === '1'; } catch (_) { return false; }
  }

  function init() {
    document.querySelectorAll('#scr-menu [data-go]').forEach(b => {
      if (b.dataset.go === 'codes') b.onclick = open;
    });
    $('code-claim').onclick = redeemInput;
    $('code-input').addEventListener('keydown', e => { if (e.key === 'Enter') redeemInput(); });
    $('code-admin-toggle').onclick = toggleAdmin;
    document.querySelectorAll('#scr-codes [data-back]').forEach(b => { b.onclick = () => G.MenuUI.open(); });
    G.DB.onSync(() => { if (G.UI.isOpen('scr-codes')) renderAdmin(); });
  }

  function open() {
    G.UI.show('scr-codes', true);
    $('code-input').value = '';
    $('code-msg').textContent = '';
    $('code-msg').className = 'err';
    renderAdmin();
    $('code-input').focus();
  }

  function renderAdmin() {
    const box = $('code-admin-tools');
    box.classList.toggle('hidden', !isAdminAccount());
    if (isAdminAccount()) $('code-admin-toggle').textContent = isAdminMode() ? 'Desactivar modo Admin' : 'Modo Admin desactivado';
  }

  function message(text, ok = false) {
    const el = $('code-msg');
    el.textContent = text;
    el.className = ok ? 'note' : 'err';
  }

  function redeemInput() {
    const code = $('code-input').value.trim().toUpperCase();
    if (!code) { message('Escribe un código.'); return; }
    const entry = (G.REDEEM_CODES.list || []).find(c => c.code.toUpperCase() === code);
    if (!entry) { G.Audio.sfx('error'); message('Ese código no existe o ya no está activo.'); return; }
    if (G.DB.guest || !G.DB.save) { message('Inicia sesión para canjear códigos.'); return; }
    const admin = !!entry.admin;
    if (admin && !isAdminAccount()) { G.Audio.sfx('error'); message('Este código solo funciona con la cuenta administradora.'); return; }

    const save = G.DB.save;
    save.codesRedeemed = Array.isArray(save.codesRedeemed) ? save.codesRedeemed : [];
    const already = save.codesRedeemed.includes(entry.id);
    if (already && !admin) { G.Audio.sfx('error'); message('Ya canjeaste este código en esta cuenta.'); return; }

    if (admin) {
      setAdmin(true);
      if (!already) { grantAdminRewards(save); save.codesRedeemed.push(entry.id); }
      G.DB.commit(true); G.UI.refreshCoins(); renderAdmin();
      G.Audio.sfx('legend');
      message(already ? 'Modo Admin activado de nuevo en este dispositivo.' : '¡Modo Admin activado! Recursos, Pokémon y protección máxima concedidos.', true);
      return;
    }

    const r = entry.rewards || {};
    grantRewards(save, r);
    save.codesRedeemed.push(entry.id);
    G.DB.commit(true); G.UI.refreshCoins();
    G.Audio.sfx('confirm');
    message('Código canjeado. ' + describeRewards(r), true);
  }

  function grantAdminRewards(save) {
    save.coins = MAX;
    save.tickets = { t1: MAX, t10: MAX };
    save.bag = save.bag || {};
    for (const id of Object.keys(G.Shop.ITEMS)) save.bag[id] = 999;
    save.tms = save.tms || {};
    for (const id of Object.keys(G.Moves.BY_ID)) save.tms[id] = 999;
    const now = Date.now();
    for (const mon of G.DEX) {
      G.DB.grant(mon.dex, 'admin-code');
      if (G.Sprites.hasShiny(mon.dex)) G.DB.grantShiny(mon.dex, 'admin-code');
    }
    save.updated = now;
  }

  function grantRewards(save, r) {
    save.coins = Math.min(MAX, (save.coins || 0) + Math.max(0, +r.coins || 0));
    save.tickets = save.tickets || { t1: 0, t10: 0 };
    save.tickets.t1 = Math.min(MAX, save.tickets.t1 + Math.max(0, +r.ticket1 || 0));
    save.tickets.t10 = Math.min(MAX, save.tickets.t10 + Math.max(0, +r.ticket10 || 0));
    const grantDex = (value, shiny) => {
      const list = value === 'all' ? G.DEX.map(p => p.dex) : (Array.isArray(value) ? value : []);
      for (const dex of list) if (G.DEX_BY[dex]) {
        if (shiny) { if (G.Sprites.hasShiny(dex)) G.DB.grantShiny(dex, 'code'); }
        else G.DB.grant(dex, 'code');
      }
    };
    grantDex(r.pokemon, false); grantDex(r.shiny, true);
    save.bag = save.bag || {};
    for (const [id, n] of Object.entries(r.items || {})) if (G.Shop.ITEMS[id]) save.bag[id] = Math.min(999, (save.bag[id] || 0) + Math.max(0, Math.floor(+n || 0)));
    save.tms = save.tms || {};
    for (const [id, n] of Object.entries(r.tms || {})) if (G.Moves.BY_ID[id]) save.tms[id] = Math.min(999, (save.tms[id] || 0) + Math.max(0, Math.floor(+n || 0)));
  }

  function describeRewards(r) {
    const bits = [];
    if (r.coins) bits.push(r.coins.toLocaleString('es-ES') + ' Pokémonedas');
    if (r.ticket1) bits.push(r.ticket1 + ' tickets');
    if (r.ticket10) bits.push(r.ticket10 + ' tickets ×10');
    if (r.pokemon) bits.push((r.pokemon === 'all' ? G.DEX.length : r.pokemon.length) + ' Pokémon');
    if (r.shiny) bits.push((r.shiny === 'all' ? G.DEX.filter(p => G.Sprites.hasShiny(p.dex)).length : r.shiny.length) + ' shiny');
    const items = Object.entries(r.items || {}).filter(([id,n]) => G.Shop.ITEMS[id] && n > 0);
    for (const [id,n] of items) bits.push(n + ' × ' + G.Shop.ITEMS[id].name);
    const tms = Object.entries(r.tms || {}).filter(([id,n]) => G.Moves.BY_ID[id] && n > 0);
    for (const [id,n] of tms) bits.push(n + ' MT ' + G.Moves.BY_ID[id].name);
    return bits.join(' · ') || 'recompensa especial';
  }

  function setAdmin(on) {
    try {
      if (on) localStorage.setItem(activeKey(adminEmail()), '1');
      else localStorage.removeItem(activeKey(adminEmail()));
    } catch (_) { /* el resto de recompensas sí se conserva aunque el navegador bloquee localStorage */ }
  }
  function toggleAdmin() { setAdmin(!isAdminMode()); renderAdmin(); message(isAdminMode() ? 'Modo Admin activado.' : 'Modo Admin desactivado.', true); }

  return { init, open, get adminMode() { return isAdminMode(); }, get adminAccount() { return isAdminAccount(); } };
})();

/* ============ news-ui.js — "Novedades" ============
 * Historial integrado del juego + anuncios públicos editables por Admin.
 */
G.NewsUI = (() => {
  const $ = G.UI.$;
  const KEY = 'ps.news.seen', REMOTE_SEEN = 'ps.news.remote-seen';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let remote = [], remoteStamp = 0, editing = null;
  const latestStatic = () => (G.CHANGELOG[0] || {}).d || '';
  function seen() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function seenRemote() { try { return Number(localStorage.getItem(REMOTE_SEEN)) || 0; } catch (e) { return 0; } }
  function isAdmin() { return !!(G.CodesUI && G.CodesUI.adminMode && G.DB.fb); }

  function init() {
    const b = $('btn-news');
    b.innerHTML = G.Icons.html('book', 18) + ' <span>Novedades</span><i class="dot"></i>';
    b.onclick = open;
    $('news-close').onclick = close;
    initManager();
    refresh();
    setTimeout(() => G.DB.ready().then(probeLatest).catch(() => {}), 0);
  }

  function refresh() {
    $('btn-news').classList.toggle('new', seen() < latestStatic() || remoteStamp > seenRemote());
  }

  function fmt(d) {
    const parts = String(d || '').split('-').map(Number);
    if (parts.length !== 3 || parts.some(n => !n)) return '';
    return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString(G.I18n.locale, { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function pairText(pair) {
    return G.I18n.lang === 'es' ? pair[0] : G.I18n.lang === 'en' || !G.I18n.has(pair[0]) ? pair[1] : G.T(pair[0]);
  }

  function remoteAsNews(a) {
    return { d: a.date, title: [a.titleEs, a.titleEn], new: [[a.bodyEs, a.bodyEn]], remote: true };
  }

  function renderNews() {
    const PARTS = [['new', ['Nuevo', 'New']], ['chg', ['Cambios', 'Changes']], ['fix', ['Arreglos', 'Fixes']]];
    const entries = G.CHANGELOG.map(v => ({ ...v, remote: false })).concat(remote.map(remoteAsNews))
      .sort((a, b) => String(b.d).localeCompare(String(a.d)) || Number(b.remote) - Number(a.remote));
    $('news-body').innerHTML = entries.map(v =>
      `<div class="news-day" translate="no"><h3>${esc(pairText(v.title || ['', '']))}<small>${esc(fmt(v.d))}</small></h3>` +
        PARTS.filter(([k]) => v[k] && v[k].length).map(([k, lbl]) =>
          `<div class="news-part"><span class="news-tag ${k}">${pairText(lbl)}</span><ul>${v[k].map(t => `<li>${esc(pairText(t)).replace(/\n/g, '<br>')}</li>`).join('')}</ul></div>`).join('') +
      '</div>').join('');
    $('news-body').scrollTop = 0;
  }

  async function probeLatest() {
    const fb = G.DB.fb;
    if (!fb) return;
    try {
      const s = await fb.fs.collection('announcements').orderBy('updatedAt', 'desc').limit(1).get();
      if (!s.empty) {
        const a = s.docs[0].data(), ms = a.updatedAt && a.updatedAt.toMillis ? a.updatedAt.toMillis() : 0;
        remoteStamp = Math.max(remoteStamp, ms);
        refresh();
      }
    } catch (_) { /* La lista histórica sigue disponible si el feed remoto aún no tiene reglas. */ }
  }

  async function loadRemote() {
    const fb = G.DB.fb;
    if (!fb) { remote = []; remoteStamp = 0; return; }
    const snap = await fb.fs.collection('announcements').orderBy('date', 'desc').limit(50).get();
    remote = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(a => a.titleEs && a.titleEn && a.bodyEs && a.bodyEn && a.date);
    remoteStamp = remote.reduce((n, a) => Math.max(n, a.updatedAt && a.updatedAt.toMillis ? a.updatedAt.toMillis() : 0), remoteStamp);
  }

  function markSeen() {
    try { localStorage.setItem(KEY, latestStatic()); localStorage.setItem(REMOTE_SEEN, String(remoteStamp)); } catch (e) { /* nada */ }
    refresh();
  }

  function open() {
    renderNews();
    $('scr-news').classList.remove('hidden');
    renderManager();
    markSeen();
    loadRemote().then(() => {
      renderNews(); renderManager(); markSeen();
    }).catch(e => {
      if (isAdmin()) setStatus('No se pudieron cargar los anuncios (' + (e.code || e.message) + '). Revisa las reglas de Firestore.');
    });
  }

  function close() { $('scr-news').classList.add('hidden'); }
  function t(s) { return esc(G.T(s)); }

  function initManager() {
    const closeBtn = $('news-close'), head = closeBtn.parentElement;
    const adminBtn = document.createElement('button');
    adminBtn.id = 'news-admin-toggle'; adminBtn.className = 'btn small ghost hidden'; adminBtn.textContent = G.T('Gestionar novedades');
    adminBtn.onclick = () => $('news-admin').classList.toggle('hidden');
    head.insertBefore(adminBtn, closeBtn);

    const root = document.createElement('div');
    root.id = 'news-admin'; root.className = 'news-admin hidden';
    root.innerHTML = `<div class="row between"><b>${t('Administrar novedades')}</b><button id="news-admin-add" class="btn small gold">${t('Crear anuncio')}</button></div>` +
      `<p id="news-admin-status" class="note"></p><form id="news-admin-form" class="news-admin-form hidden">` +
      `<label>${t('Título en español')}<input id="news-admin-title-es" class="field" maxlength="100" required></label>` +
      `<label>${t('Título en inglés')}<input id="news-admin-title-en" class="field" maxlength="100" required></label>` +
      `<label>${t('Texto en español')}<textarea id="news-admin-body-es" class="field" maxlength="2400" rows="3" required></textarea></label>` +
      `<label>${t('Texto en inglés')}<textarea id="news-admin-body-en" class="field" maxlength="2400" rows="3" required></textarea></label>` +
      `<label>${t('Fecha')}<input id="news-admin-date" class="field" type="date" required></label>` +
      `<div class="row"><button id="news-admin-save" class="btn gold" type="submit">${t('Guardar anuncio')}</button><button id="news-admin-cancel" class="btn ghost" type="button">${t('Cancelar')}</button></div></form>` +
      `<div id="news-admin-list" class="news-admin-list"></div>`;
    $('news-body').parentElement.insertBefore(root, $('news-body'));

    $('news-admin-add').onclick = () => beginEdit(null);
    $('news-admin-cancel').onclick = cancelEdit;
    $('news-admin-form').onsubmit = saveAnnouncement;
  }

  function renderManager() {
    const on = isAdmin();
    $('news-admin-toggle').classList.toggle('hidden', !on);
    $('news-admin').classList.toggle('hidden', !on || $('news-admin').classList.contains('hidden'));
    if (!on) return;
    const list = $('news-admin-list'); list.innerHTML = '';
    if (!remote.length) { list.innerHTML = `<p class="sub">${t('Todavía no hay anuncios publicados.')}</p>`; return; }
    for (const a of remote) {
      const row = document.createElement('div'); row.className = 'news-admin-row';
      const info = document.createElement('div');
      info.innerHTML = `<b>${esc(a.titleEs)}</b><small>${esc(fmt(a.date))}</small>`;
      const actions = document.createElement('div'); actions.className = 'row';
      const edit = document.createElement('button'); edit.className = 'btn small ghost'; edit.textContent = G.T('Editar'); edit.onclick = () => beginEdit(a);
      const del = document.createElement('button'); del.className = 'btn small ghost'; del.textContent = G.T('Borrar'); del.onclick = () => deleteAnnouncement(a);
      actions.append(edit, del); row.append(info, actions); list.appendChild(row);
    }
  }

  function setStatus(s) { $('news-admin-status').textContent = s ? G.T(s) : ''; }
  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function beginEdit(a) {
    editing = a ? a.id : null;
    $('news-admin-title-es').value = a ? a.titleEs : '';
    $('news-admin-title-en').value = a ? a.titleEn : '';
    $('news-admin-body-es').value = a ? a.bodyEs : '';
    $('news-admin-body-en').value = a ? a.bodyEn : '';
    $('news-admin-date').value = a ? a.date : today();
    $('news-admin-save').textContent = G.T(a ? 'Guardar cambios' : 'Guardar anuncio');
    $('news-admin-form').classList.remove('hidden'); setStatus('');
    $('news-admin-title-es').focus();
  }

  function cancelEdit() { editing = null; $('news-admin-form').reset(); $('news-admin-form').classList.add('hidden'); setStatus(''); }

  async function saveAnnouncement(e) {
    e.preventDefault();
    if (!isAdmin()) return setStatus('Inicia sesión con la cuenta Admin y activa el modo Admin.');
    const fb = G.DB.fb, date = $('news-admin-date').value;
    if (!fb || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return setStatus('Comprueba la conexión y la fecha.');
    const payload = {
      titleEs: $('news-admin-title-es').value.trim(), titleEn: $('news-admin-title-en').value.trim(),
      bodyEs: $('news-admin-body-es').value.trim(), bodyEn: $('news-admin-body-en').value.trim(), date,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (!payload.titleEs || !payload.titleEn || !payload.bodyEs || !payload.bodyEn) return setStatus('Completa los campos en español y en inglés.');
    const save = $('news-admin-save'); save.disabled = true; setStatus('Guardando…');
    try {
      const col = fb.fs.collection('announcements');
      if (editing) await col.doc(editing).update(payload);
      else await col.add({ ...payload, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      cancelEdit(); await loadRemote(); renderNews(); renderManager(); markSeen();
      setStatus('Anuncio publicado.');
    } catch (err) {
      setStatus(err.code === 'permission-denied'
        ? 'Firebase rechazó el cambio. Publica las reglas actualizadas de firestore.rules en el proyecto pokgames-d05a0.'
        : 'No se pudo guardar (' + (err.code || err.message) + ').');
    } finally { save.disabled = false; }
  }

  async function deleteAnnouncement(a) {
    if (!isAdmin() || !confirm('¿Borrar «' + a.titleEs + '» de Novedades?')) return;
    setStatus('Borrando…');
    try {
      await G.DB.fb.fs.collection('announcements').doc(a.id).delete();
      await loadRemote(); renderNews(); renderManager(); markSeen(); setStatus('Anuncio borrado.');
    } catch (err) {
      setStatus(err.code === 'permission-denied'
        ? 'Firebase rechazó el cambio. Publica las reglas actualizadas de firestore.rules en el proyecto pokgames-d05a0.'
        : 'No se pudo borrar (' + (err.code || err.message) + ').');
    }
  }

  return { init, open, close };
})();

/* ============ rift.js — grietas y arena del legendario ============
 *
 * De vez en cuando (pocas veces por partida) se abre una GRIETA cerca de un
 * jugador. Dura GRIETA_TTL segundos; si entras, te lleva (con todo el grupo)
 * a una arena cerrada en el Mundo Distorsión, contra un Pokémon LEGENDARIO.
 *
 *   ganas    el legendario suelta tickets (el ×10, la mitad de las veces) y monedas, y cada uno se lleva un
 *            VÍNCULO (fusiona movimientos, ver Player.fuse); a los pocos
 *            segundos volvéis al mapa donde estabais y se elige la fusión
 *   pierdes  (caéis todos o se acaba el tiempo) volvéis sin premio, con algo
 *            de vida; la partida sigue
 *
 * Mientras dura la arena, los enemigos del mapa se guardan (EnemyMgr.stash) y
 * no aparecen nuevos; al volver todo sigue como estaba.
 *
 * Cooperativo: lo decide el anfitrión. Mensajes (ver coop.js):
 *   'rift' x y ttl · 'riftx' · 'arena' cfg · 'aw' (ganada) · 'al' (perdida)
 *   y del invitado al anfitrión 're' (he entrado en la grieta).
 */
G.Rift = (() => {
  // (0.14 hasta el 11-10-2026: más grietas para que se vean los vínculos)
  // Menos azar (12-10-2026): cada vez que no sale, la siguiente es más
  // probable (20 %, 40 %, 60 %, 80 %, 100 %): como mucho 2,5 min sin grieta.
  // Desde 2 min antes de la Sentencia de Arceus (minuto 30) ya no se abren.
  const CHECK = 30, CHANCE = 0.2, TTL = 45, ABYSS_CHANCE = 0.025;
  const ARENA_R = 11, ARENA_TIME = 120, FROM = 75, GLITCH_CHANCE = 0.07;
  let rift = null;          // { x, y, ttl, t, kind }
  let arena = null;         // { tx, ty, r, dex, shiny, x, y, back, biome, t, phase, endT, bossId }
  let zone = null;          // dónde estaba la última arena { x, y, r } (ver leftBehind)
  let checkT = CHECK, asked = false, downT = 0, misses = 0;
  const authority = () => !G.Coop.active || G.Coop.isHost;
  const TS = () => G.Tiles.T * G.Sprites.PX;

  function reset() { rift = null; arena = null; zone = null; checkT = CHECK; asked = false; downT = 0; misses = 0; }

  /**
   * ¿Sigue este jugador en la arena aunque aquí ya se haya vuelto al mapa?
   * En grupo, el anfitrión vuelve unas décimas antes que los invitados (el aviso
   * tarda en llegar) y en ese rato los ve aún allí: el jefe que esperaba salía a su
   * lado, a miles de metros, y ya no se le encontraba (ni salían más grietas).
   */
  function leftBehind(p) {
    return !arena && !!zone && G.U.dist2(p.x, p.y, zone.x, zone.y) < zone.r * zone.r;
  }

  // ---------------- grieta en el mapa ----------------

  function update(dt, pl, time) {
    if (rift) {
      rift.t += dt;
      rift.ttl -= dt;
      if (rift.ttl <= 0) { rift = null; return; }
      if (!arena && !pl.dead && G.U.dist2(pl.x, pl.y, rift.x, rift.y - 10) < 30 * 30) enter();
    } else if (!arena && authority() && time > FROM && time < G.Judgment.AT - 120) {
      checkT -= dt;
      if (checkT <= 0) {
        checkT = CHECK;
        if (G.EnemyMgr.bossAlive()) return;           // con un jefe vivo no cuenta como intento
        if (Math.random() < CHANCE * (1 + misses)) { misses = 0; open(); }
        else misses++;
      }
    }
    if (arena) arenaTick(dt, pl);
  }

  function open() {
    const alive = G.Game.everyone().filter(p => !p.dead);
    const near = G.U.pick(alive.length ? alive : [G.Game.player]);
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * 6.2832, d = G.U.rand(380, 560);
      const x = near.x + Math.cos(a) * d, y = near.y + Math.sin(a) * d * 0.85;
      if (!G.World.isFree(x, y, 22)) continue;
      const roll = Math.random();
      const kind = roll < ABYSS_CHANCE ? 'abyss' : roll < ABYSS_CHANCE + GLITCH_CHANCE ? 'glitch' : 'normal';
      show(x, y, TTL, kind);
      if (G.Coop.isHost) G.Coop.broadcast(['rift', Math.round(x), Math.round(y), TTL, kind]);
      return;
    }
  }

  /** Crea una grieta a poca distancia para que el Admin pueda entrar enseguida. */
  function adminOpen(kind = 'normal') {
    if (!G.CodesUI || !G.CodesUI.adminMode || !authority() || arena) return false;
    const pl = G.Game.player;
    if (!pl || pl.dead) return false;
    for (let i = 0; i < 32; i++) {
      const a = i * 2.399963, d = 130 + (i % 4) * 18;
      const x = pl.x + Math.cos(a) * d, y = pl.y + Math.sin(a) * d * 0.85;
      if (G.World.isFree(x, y, 22)) {
        const riftKind = ['glitch', 'abyss'].includes(kind) ? kind : 'normal';
        show(x, y, TTL, riftKind);
        if (G.Coop.isHost) G.Coop.broadcast(['rift', Math.round(x), Math.round(y), TTL, rift.kind]);
        G.Spawner.say(rift.kind === 'glitch' ? '¡Grieta glitcheada invocada!' : rift.kind === 'abyss' ? '¡Puerta Abismal invocada!' : '¡Grieta invocada!', 2.4, true);
        return true;
      }
    }
    return false;
  }

  /** Aparece la grieta (también la que manda el anfitrión). */
  function show(x, y, ttl, kind = 'normal') {
    rift = { x, y, ttl, t: 0, kind };
    asked = false;
    // (El aviso grande lo dibuja hud.js mientras rift.t < 4,5 s.)
    G.Audio.sfx('rift');
    const color = kind === 'glitch' ? '#42fff0' : kind === 'abyss' ? '#ff9b38' : '#b48aff';
    G.FX.ring(x, y, 6, 80, color, 0.7, 5);
  }

  function enter() {
    if (asked) return;
    asked = true;
    if (authority()) start();
    else G.Coop.toHost(['re']);
  }

  // ---------------- arena ----------------

  /** Quien manda: elige legendario y lugar, y avisa a todos. */
  let nextType = null;          // pruebas/vídeos: tipo de la próxima arena

  function start(forceType) {
    if (arena) return;
    forceType = forceType || nextType; nextType = null;
    const glitch = !!(rift && rift.kind === 'glitch');
    if (glitch) {
      const pool = G.DEX.filter(p => G.SPRITE_META[p.dex]);
      const mon = G.U.pick(pool);
      const cfg = { tx: 5000 + Math.floor(Math.random() * 3000), ty: 5000 + Math.floor(Math.random() * 3000),
        r: 28, dex: mon.dex, shiny: false, type: 'glitch', layout: 'glitch', glitch: true };
      if (G.Coop.isHost) G.Coop.broadcast(['arena', cfg]);
      begin(cfg);
      spawnGlitchWave(4, [[0, 1], [-1, 0], [1, 0], [0, -2]]);
      G.Spawner.say('Explora las salas: resuelve los dos puzles para abrir la puerta', 5, true);
      return;
    }
    const abyss = !!(rift && rift.kind === 'abyss');
    if (abyss) {
      const pharaohDex = G.SPRITE_META[563] ? 563 : G.U.pick(G.DEX.filter(p => p.leg && G.SPRITE_META[p.dex])).dex;
      const cfg = { tx: 8000 + Math.floor(Math.random() * 3000), ty: 8000 + Math.floor(Math.random() * 3000),
        r: 58, dex: pharaohDex, shiny: false, type: 'pharaoh', layout: 'pharaoh', pharaoh: true };
      if (G.Coop.isHost) G.Coop.broadcast(['arena', cfg]);
      begin(cfg);
      spawnPharaohWave(8, [[0, 30], [-4, 31], [4, 31], [-6, 33], [6, 33], [-2, 35], [2, 35], [0, 35]]);
      G.Spawner.say('La Puerta Abismal se ha cerrado. Recorre las salas hasta la cámara del faraón.', 5, true);
      return;
    }
    let pool = G.DEX.filter(p => p.leg && G.SPRITE_META[p.dex]);
    if (forceType && pool.some(p => p.types.includes(forceType))) pool = pool.filter(p => p.types.includes(forceType));
    // Los legendarios que aún no has vencido salen 4 veces más (menos repetidos).
    const beaten = (G.DB.save && G.DB.save.legends) || {};
    const ws = pool.map(p => (beaten[p.dex] ? 1 : 4));
    let r = Math.random() * ws.reduce((a, b) => a + b, 0), mi = 0;
    while (mi < pool.length - 1 && (r -= ws[mi]) > 0) mi++;
    const mon = pool[mi];
    const cfg = {
      tx: 5000 + Math.floor(Math.random() * 3000), ty: 5000 + Math.floor(Math.random() * 3000), r: ARENA_R,
      dex: mon.dex, shiny: G.Sprites.hasShiny(mon.dex) && Math.random() < 1 / 512,
      // La arena es la de uno de sus tipos, al azar.
      type: forceType || G.U.pick(mon.types)
    };
    if (G.Coop.isHost) G.Coop.broadcast(['arena', cfg]);
    begin(cfg);
    spawnLegend();
  }

  /** En cada ordenador: viaje a la arena. */
  function begin(cfg) {
    const pl = G.Game.player;
    const ts = TS();
    arena = Object.assign({}, cfg, {
      x: cfg.tx * ts + ts / 2, y: cfg.ty * ts + ts / 2,
      back: { x: pl.x, y: pl.y }, biome: G.World.biome, t: 0, phase: 'fight', endT: 0, bossId: 0,
      glitch: !!cfg.glitch, dungeon: cfg.glitch ? { a: 0, b: 0, open: false, stepA: 0, stepB: 0, spawnedA: false, spawnedB: false, lastA: -1, lastB: -1, seenDex: [cfg.dex] } : null
    });
    arena.pharaoh = !!cfg.pharaoh;
    if (arena.pharaoh) arena.tomb = { west: false, east: false, north: false };
    zone = { x: arena.x, y: arena.y, r: (cfg.r + 10) * ts };
    rift = null; asked = false; downT = 0;
    if (authority()) G.EnemyMgr.stash(); else G.EnemyMgr.clearRemote();
    G.Projectiles.clear();
    G.Combat.clearFields();
    G.Hazards.clear();
    G.World.setArena({ tx: cfg.tx, ty: cfg.ty, r: cfg.r, type: cfg.type, layout: cfg.layout, dungeon: arena.dungeon });
    G.World.setBiome(G.Tiles.arenaBiome(cfg.type), true);
    // Cada arena trae su clima (el volcán, sol; el glaciar, nieve...).
    const th = G.Tiles.ARENA_THEMES[cfg.type];
    if (th && th.weather) G.Weather.force(th.weather, arena.pharaoh ? 615 : ARENA_TIME + 15);
    // Todos al sur de la arena, en fila; el legendario aparece al norte.
    const ps = G.Game.everyone();
    ps.forEach((p, i) => { p.x = arena.x + (i - (ps.length - 1) / 2) * 34; p.y = arena.y + ts * (cfg.glitch ? 11 : cfg.pharaoh ? 30 : 3); });
    G.Camera.x = pl.x; G.Camera.y = pl.y;
    G.Game.flash(cfg.glitch ? '#42fff0' : cfg.pharaoh ? '#ffb84a' : '#c9a6ff', 0.9);
    G.Audio.sfx('rift');
    G.Spawner.say('Has entrado en la grieta…', 2.4, true);
  }

  const TOMB_POKEMON = [562, 563, 867, 769, 770, 710, 711, 623, 622, 302, 355, 356, 429, 442, 477, 478, 592, 593, 708, 709, 778];
  function spawnPharaohWave(n, spots) {
    if (!arena || !arena.pharaoh || !authority()) return;
    const t = G.Game.st.time, party = G.Game.everyone().length, ts = TS();
    let pool = TOMB_POKEMON.map(dex => G.DEX_BY[dex]).filter(mon => mon && G.SPRITE_META[mon.dex]);
    if (!pool.length) pool = G.DEX.filter(mon => mon.types.includes('ghost') && G.SPRITE_META[mon.dex]);
    if (!pool.length) pool = G.DEX.filter(mon => G.SPRITE_META[mon.dex]);
    for (let i = 0; i < n; i++) {
      const mon = G.U.pick(pool), spot = spots[i % spots.length];
      const x = arena.x + spot[0] * ts, y = arena.y + spot[1] * ts;
      const ghostly = mon.types.includes('ghost') || mon.types.includes('dark');
      const def = { dex: mon.dex, name: mon.name,
        hp: Math.round((250 + t * 3.4) * G.Coop.scaleHp(party)),
        spd: G.U.clamp(mon.spd * (ghostly ? 0.68 : 0.55), 34, 82),
        dmg: Math.round(48 + t / 15), xp: Math.round(90 + t),
        behavior: ghostly ? 'ranged' : 'charger', shotDmg: Math.round(27 + t / 35), shotCd: 1.1, range: 260 };
      const e = new G.Enemy(def, x, y, { hp: 1, spd: 1, dmg: 1 });
      e.mummy = [562,563,867].includes(mon.dex);
      e.halloween = [710,711,778].includes(mon.dex);
      e.name = (e.mummy ? 'MOMIA ' : e.halloween ? 'CALABAZA ' : 'ESPECTRO ') + mon.name;
      G.EnemyMgr.add(e);
    }
  }

  function pharaohDungeonTick(dt) {
    if (arena.phase !== 'fight') { arena.endT -= dt; if (arena.endT <= 0) finish(); return; }
    if (!authority()) return;
    const ts = TS(), party = G.Game.everyone().filter(p => !p.dead), d = arena.tomb;
    const inside = (p, x1, x2, y1, y2) => (p.x-arena.x)/ts >= x1 && (p.x-arena.x)/ts <= x2 && (p.y-arena.y)/ts >= y1 && (p.y-arena.y)/ts <= y2;
    if (!d.west && party.some(p => inside(p, -24, -9, 2, 22))) { d.west = true; spawnPharaohWave(14, [[-20,5],[-15,5],[-20,10],[-12,11],[-19,17],[-12,19],[-16,14],[-22,13]]); G.Spawner.say('¡Las momias despiertan en la cripta oeste!', 3.5, true); }
    if (!d.east && party.some(p => inside(p, 10, 25, -24, -5))) { d.east = true; spawnPharaohWave(16, [[12,-7],[18,-7],[23,-8],[13,-13],[20,-15],[12,-20],[23,-21],[17,-23]]); G.Spawner.say('¡La sala de las calabazas está llena de espectros!', 3.5, true); }
    if (!d.north && party.some(p => inside(p, -14, 14, -54, -40))) { d.north = true; spawnPharaohWave(18, [[-12,-43],[-8,-45],[-4,-43],[4,-43],[8,-45],[12,-43],[-10,-50],[-5,-51],[5,-51],[10,-50]]); spawnPharaohBoss(); }
    if (arena.phase === 'fight' && (arena.t > 600 || G.Game.everyone().every(p => p.dead))) { G.Coop.isHost && G.Coop.broadcast(['al']); lost(); return; }
    if (arena.phase === 'fight' && arena.bossId) {
      keepInside();
      const boss = G.EnemyMgr.get(arena.bossId);
      if (!boss || boss.dead) { G.Coop.isHost && G.Coop.broadcast(['aw']); won(); }
    }
  }

  function spawnPharaohBoss() {
    if (!arena || arena.bossId || !authority()) return;
    const mon = G.DEX_BY[arena.dex], t = G.Game.st.time, n = G.Game.everyone().length, ts = TS();
    const def = { dex: mon.dex, name: mon.name, hp: Math.round((12500 + t * 36) * G.Coop.scaleHp(n)),
      spd: 52, dmg: 105 + t / 12, xp: 5000, behavior: 'ranged', shotDmg: 62 + t / 30, shotCd: 0.72, range: 320 };
    const e = new G.Enemy(def, arena.x, arena.y - ts * 47, { hp: 1, spd: 1, dmg: 1 }, true);
    e.pharaoh = true; e.name = 'FARAÓN ' + mon.name; e.flying = false;
    G.EnemyMgr.add(e); arena.bossId = e.id;
    G.Spawner.say('¡El FARAÓN ' + mon.name + ' custodia la tumba!', 4, true);
    G.Camera.kick(1.5); G.Audio.sfx('boss');
  }

  function spawnGlitchWave(n, spots) {
    if (!arena || !arena.glitch || !authority()) return;
    const t = G.Game.st.time, players = G.Game.everyone().length, ts = TS();
    const pool = G.DEX.filter(p => G.SPRITE_META[p.dex] && !arena.dungeon.seenDex.includes(p.dex));
    for (let i = 0; i < n; i++) {
      const mi = Math.floor(Math.random() * pool.length), mon = pool.splice(mi, 1)[0];
      if (!mon) break;
      arena.dungeon.seenDex.push(mon.dex);
      const spot = spots[i % spots.length], x = arena.x + spot[0] * ts, y = arena.y + spot[1] * ts;
      const def = { dex: mon.dex, name: mon.name, hp: Math.round((90 + t * 2.1) * G.Coop.scaleHp(players)),
        spd: G.U.clamp(mon.spd * 0.72, 38, 92), dmg: 18 + t / 38, xp: 32 + t * 0.5,
        behavior: mon.types.some(x => ['psychic','electric','ghost','fairy','fire','water','ice','dragon'].includes(x)) ? 'ranged' : 'charger',
        shotDmg: 12 + t / 80, shotCd: 1.3, range: 220 };
      const e = new G.Enemy(def, x, y, { hp: 1, spd: 1, dmg: 1 });
      e.glitched = true; e.name = 'GLITCH ' + mon.name; G.EnemyMgr.add(e);
    }
  }

  function spawnLegend() {
    const mon = G.DEX_BY[arena.dex];
    const t = G.Game.st.time;
    const n = G.Game.everyone().length;
    const ts = TS();
    const def = {
      dex: mon.dex, name: mon.name,
      hp: Math.round((3200 + t * 9) * G.Coop.scaleHp(n) * (n > 1 ? 1.4 : 1)),
      spd: Math.round(G.U.clamp(48 + (mon.spd - 78) * 0.6, 48, 105)),
      dmg: Math.round(36 + t / 20), xp: Math.round(500 + t * 1.2),
      behavior: mon.types.some(x => ['psychic', 'electric', 'ghost', 'fairy', 'fire', 'water', 'ice', 'dragon'].includes(x)) ? 'ranged' : 'charger',
      shotDmg: Math.round(18 + t / 40), shotCd: 0.9, range: 300
    };
    const e = new G.Enemy(def, arena.x, arena.y - ts * 3.5, { hp: 1, spd: 1, dmg: 1 }, true);
    e.legend = true;
    // Choca con las paredes y columnas como tú: si volara por encima de las
    // rocas, tus disparos no podrían alcanzarle (bug de Celebi).
    e.flying = false;
    if (arena.shiny) e.makeShiny();
    G.EnemyMgr.add(e);
    arena.bossId = e.id;
    G.Spawner.say('¡' + e.name + (e.shiny ? ' shiny' : '') + ' te esperaba en la grieta!', 3.2);
    G.Camera.kick(1.1);
    G.Audio.sfx('boss');
  }

  /** Nadie sale del círculo de la arena (por si algo empuja demasiado). */
  function keepInside() {
    const ts = TS(), max = (arena.r - 1.4) * ts;
    for (const e of G.EnemyMgr.all()) {
      if (e.remote) continue;
      const dx = e.x - arena.x, dy = e.y - arena.y, d = Math.hypot(dx, dy);
      if (d > max) { e.x = arena.x + dx / d * max; e.y = arena.y + dy / d * max; }
    }
  }

  function arenaTick(dt, pl) {
    arena.t += dt;
    if (arena.pharaoh) { pharaohDungeonTick(dt); return; }
    if (arena.glitch) {
      dungeonTick(dt, pl);
      if (arena.phase === 'fight' && (arena.t > 300 || G.Game.everyone().every(p => p.dead))) {
        G.Coop.isHost && G.Coop.broadcast(['al']); lost(); return;
      }
      if (arena.phase === 'fight' && arena.bossId) {
        if (!authority()) return;
        keepInside();
        const boss = G.EnemyMgr.get(arena.bossId);
        if (!boss || boss.dead) { G.Coop.isHost && G.Coop.broadcast(['aw']); won(); return; }
        if (arena.t > 300) { G.Coop.isHost && G.Coop.broadcast(['al']); lost(); }
      } else if (arena.phase !== 'fight') {
        arena.endT -= dt;
        if (arena.endT <= 0) finish();
      }
      return;
    }
    if (arena.phase === 'fight') {
      if (!authority()) return;
      keepInside();
      const boss = G.EnemyMgr.get(arena.bossId);
      if (!boss || boss.dead) { G.Coop.isHost && G.Coop.broadcast(['aw']); won(); return; }
      const allDown = G.Game.everyone().every(p => p.dead);
      downT = allDown ? downT + dt : 0;
      if (downT > 1.4 || arena.t > ARENA_TIME) { G.Coop.isHost && G.Coop.broadcast(['al']); lost(); }
      return;
    }
    arena.endT -= dt;
    if (arena.endT <= 0) finish();
  }

  const GLYPHS = [[-10,-3],[-7,0],[-10,2]], NODES = [[7,-3],[10,0],[7,2]];
  const SEQ_A = [0,2,1], SEQ_B = [2,0,1];
  function dungeonTick(dt, pl) {
    if (!authority() || arena.phase !== 'fight') return;
    const ts = TS(), party = G.Game.everyone().filter(p => !p.dead), d = arena.dungeon;
    const before = [d.a, d.b, d.stepA, d.stepB].join(',');
    // Las salas laterales tienen encuentros propios con Pokémon corrompidos.
    if (!d.spawnedA && party.some(p => (p.x-arena.x)/ts < -5 && (p.y-arena.y)/ts > -6 && (p.y-arena.y)/ts < 4)) { d.spawnedA = true; spawnGlitchWave(3, [[-11,-4],[-6,-4],[-11,2]]); }
    if (!d.spawnedB && party.some(p => (p.x-arena.x)/ts > 5 && (p.y-arena.y)/ts > -6 && (p.y-arena.y)/ts < 4)) { d.spawnedB = true; spawnGlitchWave(3, [[6,-4],[11,-4],[11,2]]); }
    const pad = (points, progress, seq, lastKey) => {
      let found = -1;
      points.forEach((p, i) => { if (party.some(who => G.U.dist2(who.x, who.y, arena.x + p[0] * ts, arena.y + p[1] * ts) < 24 * 24)) found = i; });
      if (found < 0) { d[lastKey] = -1; return progress; }
      if (found === d[lastKey]) return progress;
      d[lastKey] = found;
      if (found === seq[progress]) {
        progress++;
        G.FX.ring(arena.x + points[found][0] * ts, arena.y + points[found][1] * ts, 5, 52, '#42fff0', 0.5, 4);
        G.Audio.sfx('select');
        if (progress >= seq.length) return seq.length;
      } else { progress = found === seq[0] ? 1 : 0; G.Audio.sfx('back'); }
      return progress;
    };
    if (!d.a) d.stepA = pad(GLYPHS, d.stepA, SEQ_A, 'lastA');
    if (!d.b) d.stepB = pad(NODES, d.stepB, SEQ_B, 'lastB');
    const oldOpen = d.open;
    d.a = d.stepA >= SEQ_A.length ? 1 : d.a;
    d.b = d.stepB >= SEQ_B.length ? 1 : d.b;
    d.open = !!(d.a && d.b);
    if (oldOpen !== d.open) {
      G.World.setArena(G.World.arena);
      if (d.open) {
        G.Spawner.say('¡Los dos puzles están resueltos! La puerta del jefe se ha abierto', 4, true);
        if (G.Coop.isHost) G.Coop.broadcast(['rp', { a:d.a,b:d.b,stepA:d.stepA,stepB:d.stepB,open:d.open }]);
        spawnGlitchBoss();
      }
    } else if (G.Coop.isHost && before !== [d.a, d.b, d.stepA, d.stepB].join(',')) {
      G.Coop.broadcast(['rp', { a:d.a,b:d.b,stepA:d.stepA,stepB:d.stepB,open:d.open }]);
    }
  }

  function spawnGlitchBoss() {
    if (!arena || arena.bossId || !authority()) return;
    const mon = G.DEX_BY[arena.dex], t = G.Game.st.time, n = G.Game.everyone().length;
    const def = { dex: mon.dex, name: mon.name, hp: Math.round((2800 + t * 8) * G.Coop.scaleHp(n) * (n > 1 ? 1.35 : 1)),
      spd: 65, dmg: 32 + t / 24, xp: 850 + t, behavior: 'ranged', shotDmg: 20 + t / 45, shotCd: 0.8, range: 280 };
    const ts = TS(), e = new G.Enemy(def, arena.x, arena.y - 21 * ts, { hp:1,spd:1,dmg:1 }, true);
    e.glitched = true; e.name = 'GLITCHED ' + mon.name; e.flying = false;
    G.EnemyMgr.add(e); arena.bossId = e.id;
    G.Spawner.say('¡' + e.name + ' custodia la última sala!', 3.6, true);
    G.Camera.kick(1); G.Audio.sfx('boss');
  }

  function won() {
    if (!arena || arena.phase !== 'fight') return;
    arena.phase = 'won'; arena.endT = 5;
    G.Progress.event('rift', { type: arena.type });
    G.Pickups.pullAll();
    G.Spawner.say('¡Has vencido a ' + G.DEX_BY[arena.dex].name + '! Recoge el premio…', 3.4, true);
    G.Audio.sfx('legend');
    const pl = G.Game.player;
    if (pl) {
      pl.bonds++;
      G.FX.dmgText(pl.x, pl.y - pl.bodyH - 10, '¡Vínculo!', '#ff8ad8', true);
      G.FX.ring(pl.x, pl.y, 8, 90, '#ff8ad8', 0.7, 5);
    }
  }

  function lost() {
    if (!arena || arena.phase !== 'fight') return;
    arena.phase = 'lost'; arena.endT = 1.2;
    G.Spawner.say('La grieta os ha expulsado…', 2.6, true);
    G.Audio.sfx('back');
  }

  /** En cada ordenador: vuelta al mapa. */
  function finish() {
    const pl = G.Game.player;
    const a = arena;
    arena = null;
    G.World.setBiome(a.biome, true);
    G.Weather.clear();
    // Invitado: no se borra nada. El anfitrión avisa de los de la arena que se
    // van y de los del mapa que vuelven; si el invitado terminaba su cuenta
    // atrás un poco más tarde (pasa casi siempre), borraba los que acababan de
    // volver y no se veían hasta que caían (sólo sus ataques).
    if (authority()) G.EnemyMgr.restore();
    G.Projectiles.clear();
    G.Combat.clearFields();
    G.Hazards.clear();
    for (const p of G.Game.everyone()) { p.x = a.back.x; p.y = a.back.y; }
    pl.x = a.back.x; pl.y = a.back.y;
    if (pl.dead) pl.revive(0.3);
    G.Camera.x = pl.x; G.Camera.y = pl.y;
    G.Game.flash('#c9a6ff', 0.8);
    if (pl.bonds > 0) G.Game.offerBond();
  }

  // ---------------- dibujo ----------------

  /** La grieta, para ordenarla por Y con el resto de la escena. */
  function drawable() {
    const out = [];
    if (rift) out.push({ y: rift.y, draw(ctx) {
        const P = G.Sprites.PX;
        const img = G.Tiles.propSprite(0, 'rift', Math.floor(rift.t * 8) % 4);
        const w = img.width * P, h = img.height * P;
        const fadeIn = Math.min(1, rift.t * 2), fadeOut = Math.min(1, rift.ttl / 1.5);
        ctx.save();
        ctx.globalAlpha = 0.25 * fadeIn * fadeOut;
        ctx.fillStyle = rift.kind === 'glitch' ? '#20cfc7' : rift.kind === 'abyss' ? '#e75b24' : '#7b3cff';
        ctx.beginPath(); ctx.ellipse(rift.x, rift.y, 34, 12, 0, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = fadeIn * fadeOut;
        ctx.save(); if (rift.kind === 'glitch') ctx.filter = 'hue-rotate(280deg) saturate(1.7)'; else if (rift.kind === 'abyss') ctx.filter = 'sepia(1) saturate(2.4) hue-rotate(345deg)';
        ctx.drawImage(img, Math.round(rift.x - w / 2), Math.round(rift.y - h + 4), w, h); ctx.restore();
        ctx.restore();
        if (Math.random() < 0.3) G.FX.px(rift.x + G.U.rand(-14, 14), rift.y - G.U.rand(10, 80), rift.kind === 'glitch' ? '#42fff0' : rift.kind === 'abyss' ? '#ffbf52' : '#d9c2ff', { vy: -40, life: 0.6 });
      }});
    if (arena && arena.glitch) {
      const ts = TS(), points = [...GLYPHS.map((p,i)=>({p,i})), ...NODES.map((p,i)=>({p,i}))];
      points.forEach((q,i) => out.push({ y: arena.y + q.p[1] * ts, draw(ctx) {
        const x = arena.x + q.p[0] * ts, y = arena.y + q.p[1] * ts, on = i < 3 ? !!arena.dungeon.a : !!arena.dungeon.b;
        const glyphs = ['◇','△','○'];
        ctx.save(); ctx.globalAlpha = on ? 0.42 : 0.8; ctx.fillStyle = on ? '#65ffe8' : (i < 3 ? ['#ff56c8','#ff9e58','#d37cff'][q.i] : ['#4ce6ff','#ffd853','#ff6dd0'][q.i]);
        ctx.beginPath(); ctx.arc(x,y,18 + Math.sin(performance.now()/210+i)*2,0,6.2832); ctx.fill();
        ctx.globalAlpha=1; ctx.fillStyle='#101a2b'; ctx.font='bold 16px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(i<3?glyphs[q.i]:'✦',x,y); ctx.restore();
      }}));
      out.push({ y: arena.y - 18 * ts, draw(ctx) {
        const x=arena.x,y=arena.y-18*ts; ctx.save(); ctx.fillStyle=arena.dungeon.open?'#42fff0':'#ff4bc8'; ctx.globalAlpha=.85;
        ctx.fillRect(x-80,y-5,160,10); ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.font='bold 11px sans-serif';
        ctx.fillText(arena.dungeon.open?'PUERTA ABIERTA':'PUERTA SELLADA',x,y-18); ctx.restore();
      }});
      out.push({ y: arena.y + 5 * ts, draw(ctx) {
        const x=arena.x, y=arena.y+5*ts; ctx.save(); ctx.fillStyle='#d6fff9'; ctx.textAlign='center'; ctx.font='bold 12px sans-serif';
        ctx.fillText('RUNAS: ◇ → ○ → △',x,y); ctx.fillText('NODOS: ROSA → CIAN → ORO',x,y+17); ctx.restore();
      }});
    }
    if (arena && arena.pharaoh) {
      const ts = TS(), signs = [
        { x: -16, y: 4, text: 'CRIPTA DE LAS MOMIAS' },
        { x: 17, y: -6, text: 'GALERÍA DE CALABAZAS' },
        { x: 0, y: -39, text: 'CÁMARA DEL FARAÓN' }
      ];
      for (const s of signs) out.push({ y: arena.y + s.y * ts, draw(ctx) {
        ctx.save(); ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(28,18,10,.9)'; ctx.strokeText(G.T(s.text), arena.x + s.x * ts, arena.y + s.y * ts);
        ctx.fillStyle = '#ffd47a'; ctx.fillText(G.T(s.text), arena.x + s.x * ts, arena.y + s.y * ts); ctx.restore();
      }});
    }
    return out;
  }

  // ---------------- red ----------------

  function onEvent(ev) {
    switch (ev[0]) {
      case 'rift': show(ev[1], ev[2], ev[3], ev[4]); break;
      case 'riftx': rift = null; break;
      case 'arena': begin(ev[1]); break;
      case 'aw': won(); break;
      case 'al': lost(); break;
      case 'rp': if (arena && arena.dungeon) { Object.assign(arena.dungeon, ev[1]); G.World.setArena(G.World.arena); if (arena.dungeon.open && !arena.bossId) spawnGlitchBoss(); } break;
    }
  }

  return {
    reset, update, drawable, onEvent, leftBehind, enterRequest() { if (!arena) start(); },
    get rift() { return rift; }, get arena() { return arena; },
    get inArena() { return !!arena; },
    get timeLeft() { return arena ? Math.max(0, (arena.pharaoh ? 600 : arena.glitch ? 300 : ARENA_TIME) - arena.t) : 0; },
    debugOpen() { open(); }, adminOpen,
    /** Para pruebas: arena de un tipo ya. */
    debugArena(type) { start(type); },
    /** Para vídeos: la próxima grieta en la que entres será de este tipo. */
    debugNextType(type) { nextType = type; }
  };
})();

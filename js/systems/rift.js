```javascript
/* ============ rift.js — grietas y arena del legendario ============
 *
 * Grietas normales, glitcheadas y Puerta Abismal.
 * La mazmorra del faraón genera una distribución diferente por incursión.
 * El anfitrión genera el mapa y lo transmite al resto del grupo.
 */
G.Rift = (() => {
  const CHECK = 30, CHANCE = 0.2, TTL = 45, ABYSS_CHANCE = 0.025;
  const ARENA_R = 11, ARENA_TIME = 120, FROM = 75, GLITCH_CHANCE = 0.07;

  let rift = null;
  let arena = null;
  let zone = null;
  let checkT = CHECK, asked = false, downT = 0, misses = 0;
  let nextType = null;

  const authority = () => !G.Coop.active || G.Coop.isHost;
  const TS = () => G.Tiles.T * G.Sprites.PX;

  function reset() {
    rift = null;
    arena = null;
    zone = null;
    checkT = CHECK;
    asked = false;
    downT = 0;
    misses = 0;
  }

  function leftBehind(p) {
    return !arena && !!zone &&
      G.U.dist2(p.x, p.y, zone.x, zone.y) < zone.r * zone.r;
  }

  // ---------------- grieta en el mapa ----------------

  function update(dt, pl, time) {
    if (rift) {
      rift.t += dt;
      rift.ttl -= dt;

      if (rift.ttl <= 0) {
        rift = null;
        return;
      }

      if (!arena && !pl.dead &&
          G.U.dist2(pl.x, pl.y, rift.x, rift.y - 10) < 30 * 30) {
        enter();
      }
    } else if (!arena && authority() &&
               time > FROM && time < G.Judgment.AT - 120) {
      checkT -= dt;

      if (checkT <= 0) {
        checkT = CHECK;
        if (G.EnemyMgr.bossAlive()) return;

        if (Math.random() < CHANCE * (1 + misses)) {
          misses = 0;
          open();
        } else {
          misses++;
        }
      }
    }

    if (arena) arenaTick(dt, pl);
  }

  function open() {
    const alive = G.Game.everyone().filter(p => !p.dead);
    const near = G.U.pick(alive.length ? alive : [G.Game.player]);

    for (let i = 0; i < 24; i++) {
      const a = Math.random() * 6.2832;
      const d = G.U.rand(380, 560);
      const x = near.x + Math.cos(a) * d;
      const y = near.y + Math.sin(a) * d * 0.85;

      if (!G.World.isFree(x, y, 22)) continue;

      const roll = Math.random();
      const kind = roll < ABYSS_CHANCE
        ? 'abyss'
        : roll < ABYSS_CHANCE + GLITCH_CHANCE
          ? 'glitch'
          : 'normal';

      show(x, y, TTL, kind);

      if (G.Coop.isHost) {
        G.Coop.broadcast(['rift', Math.round(x), Math.round(y), TTL, kind]);
      }
      return;
    }
  }

  function adminOpen(kind = 'normal') {
    if (!G.CodesUI || !G.CodesUI.adminMode || !authority() || arena) {
      return false;
    }

    const pl = G.Game.player;
    if (!pl || pl.dead) return false;

    for (let i = 0; i < 32; i++) {
      const a = i * 2.399963;
      const d = 130 + (i % 4) * 18;
      const x = pl.x + Math.cos(a) * d;
      const y = pl.y + Math.sin(a) * d * 0.85;

      if (G.World.isFree(x, y, 22)) {
        const riftKind = ['glitch', 'abyss'].includes(kind)
          ? kind
          : 'normal';

        show(x, y, TTL, riftKind);

        if (G.Coop.isHost) {
          G.Coop.broadcast([
            'rift', Math.round(x), Math.round(y), TTL, rift.kind
          ]);
        }

        G.Spawner.say(
          rift.kind === 'glitch'
            ? '¡Grieta glitcheada invocada!'
            : rift.kind === 'abyss'
              ? '¡Puerta Abismal invocada!'
              : '¡Grieta invocada!',
          2.4,
          true
        );
        return true;
      }
    }

    return false;
  }

  function show(x, y, ttl, kind = 'normal') {
    rift = { x, y, ttl, t: 0, kind };
    asked = false;

    G.Audio.sfx('rift');

    const color = kind === 'glitch'
      ? '#42fff0'
      : kind === 'abyss'
        ? '#ff9b38'
        : '#b48aff';

    G.FX.ring(x, y, 6, 80, color, 0.7, 5);
  }

  function enter() {
    if (asked) return;
    asked = true;

    if (authority()) start();
    else G.Coop.toHost(['re']);
  }

  // ---------------- generación de la mazmorra ----------------

  /*
   * Las coordenadas son relativas al centro de la arena y se expresan
   * en tiles. La primera sala es la entrada y la última es la del faraón.
   *
   * Las salas intermedias se desplazan horizontalmente al azar.
   * Cada par consecutivo queda conectado por un pasillo en L.
   */
  function generatePharaohDungeon() {
    const rooms = [];
    const corridors = [];
    const levels = [31, 19, 7, -5, -17, -29, -41, -51];

    let previousX = 0;

    for (let i = 0; i < levels.length; i++) {
      let x;

      if (i === 0 || i === levels.length - 1) {
        x = 0;
      } else {
        // Evita saltos excesivos para que el camino siga siendo legible.
        const options = [-8, -6, -4, -2, 0, 2, 4, 6, 8];
        const valid = options.filter(v => Math.abs(v - previousX) <= 6);
        x = G.U.pick(valid.length ? valid : options);
      }

      const room = {
        id: i,
        x,
        y: levels[i],
        w: i === levels.length - 1 ? 9 : 4 + Math.floor(Math.random() * 2),
        h: i === 0 || i === levels.length - 1
          ? 5
          : 4 + Math.floor(Math.random() * 2),
        boss: i === levels.length - 1,
        triggered: false,
        cleared: false
      };

      rooms.push(room);

      if (i > 0) {
        corridors.push({
          x1: previousX,
          y1: levels[i - 1],
          x2: x,
          y2: levels[i],
          w: 3
        });
      }

      previousX = x;
    }

    return { rooms, corridors };
  }

  // ---------------- arena ----------------

  function start(forceType) {
    if (arena) return;

    forceType = forceType || nextType;
    nextType = null;

    const glitch = !!(rift && rift.kind === 'glitch');

    if (glitch) {
      const pool = G.DEX.filter(p => G.SPRITE_META[p.dex]);
      const mon = G.U.pick(pool);

      const cfg = {
        tx: 5000 + Math.floor(Math.random() * 3000),
        ty: 5000 + Math.floor(Math.random() * 3000),
        r: 28,
        dex: mon.dex,
        shiny: false,
        type: 'glitch',
        layout: 'glitch',
        glitch: true
      };

      if (G.Coop.isHost) G.Coop.broadcast(['arena', cfg]);

      begin(cfg);
      spawnGlitchWave(4, [[0, 1], [-1, 0], [1, 0], [0, -2]]);
      G.Spawner.say(
        'Explora las salas: resuelve los dos puzles para abrir la puerta',
        5,
        true
      );
      return;
    }

    const abyss = !!(rift && rift.kind === 'abyss');

    if (abyss) {
      const pharaohDex = G.SPRITE_META[563]
        ? 563
        : G.U.pick(
            G.DEX.filter(p => p.leg && G.SPRITE_META[p.dex])
          ).dex;

      const dungeon = generatePharaohDungeon();

      const cfg = {
        tx: 8000 + Math.floor(Math.random() * 3000),
        ty: 8000 + Math.floor(Math.random() * 3000),
        r: 65,
        dex: pharaohDex,
        shiny: false,
        type: 'pharaoh',
        layout: 'pharaoh',
        pharaoh: true,
        rooms: dungeon.rooms,
        corridors: dungeon.corridors
      };

      // El anfitrión transmite el diseño completo para que todos
      // utilicen exactamente la misma distribución.
      if (G.Coop.isHost) G.Coop.broadcast(['arena', cfg]);

      begin(cfg);

      // La primera sala contiene el encuentro de entrada.
      spawnPharaohWave(8, [
        [-2, 29], [2, 29], [-3, 31], [3, 31],
        [-2, 33], [2, 33], [-1, 35], [1, 35]
      ]);

      G.Spawner.say(
        'La Puerta Abismal se ha cerrado. Recorre las salas hasta la cámara del faraón.',
        5,
        true
      );
      return;
    }

    let pool = G.DEX.filter(p => p.leg && G.SPRITE_META[p.dex]);

    if (forceType && pool.some(p => p.types.includes(forceType))) {
      pool = pool.filter(p => p.types.includes(forceType));
    }

    const beaten = (G.DB.save && G.DB.save.legends) || {};
    const ws = pool.map(p => beaten[p.dex] ? 1 : 4);
    let r = Math.random() * ws.reduce((a, b) => a + b, 0);
    let mi = 0;

    while (mi < pool.length - 1 && (r -= ws[mi]) > 0) mi++;

    const mon = pool[mi];

    const cfg = {
      tx: 5000 + Math.floor(Math.random() * 3000),
      ty: 5000 + Math.floor(Math.random() * 3000),
      r: ARENA_R,
      dex: mon.dex,
      shiny: G.Sprites.hasShiny(mon.dex) && Math.random() < 1 / 512,
      type: forceType || G.U.pick(mon.types)
    };

    if (G.Coop.isHost) G.Coop.broadcast(['arena', cfg]);

    begin(cfg);
    spawnLegend();
  }

  function begin(cfg) {
    const pl = G.Game.player;
    const ts = TS();

    arena = Object.assign({}, cfg, {
      x: cfg.tx * ts + ts / 2,
      y: cfg.ty * ts + ts / 2,
      back: { x: pl.x, y: pl.y },
      biome: G.World.biome,
      t: 0,
      phase: 'fight',
      endT: 0,
      bossId: 0,
      glitch: !!cfg.glitch,
      dungeon: cfg.glitch
        ? {
            a: 0, b: 0, open: false, stepA: 0, stepB: 0,
            spawnedA: false, spawnedB: false,
            lastA: -1, lastB: -1, seenDex: [cfg.dex]
          }
        : null
    });

    arena.pharaoh = !!cfg.pharaoh;

    if (arena.pharaoh) {
      arena.rooms = (cfg.rooms || []).map(room => ({
        ...room,
        triggered: false,
        cleared: false
      }));
      arena.corridors = cfg.corridors || [];
      arena.tomb = { started: false, bossStarted: false };
    }

    zone = { x: arena.x, y: arena.y, r: (cfg.r + 10) * ts };
    rift = null;
    asked = false;
    downT = 0;

    if (authority()) G.EnemyMgr.stash();
    else G.EnemyMgr.clearRemote();

    G.Projectiles.clear();
    G.Combat.clearFields();
    G.Hazards.clear();

    G.World.setArena({
      tx: cfg.tx,
      ty: cfg.ty,
      r: cfg.r,
      type: cfg.type,
      layout: cfg.layout,
      dungeon: arena.dungeon,
      rooms: arena.rooms,
      corridors: arena.corridors
    });

    G.World.setBiome(G.Tiles.arenaBiome(cfg.type), true);

    const th = G.Tiles.ARENA_THEMES[cfg.type];
    if (th && th.weather) {
      G.Weather.force(th.weather, arena.pharaoh ? 615 : ARENA_TIME + 15);
    }

    const ps = G.Game.everyone();

    ps.forEach((p, i) => {
      p.x = arena.x + (i - (ps.length - 1) / 2) * 34;
      p.y = arena.y + ts * (
        cfg.glitch ? 11 : cfg.pharaoh ? 30 : 3
      );
    });

    G.Camera.x = pl.x;
    G.Camera.y = pl.y;
    G.Game.flash(
      cfg.glitch ? '#42fff0' : cfg.pharaoh ? '#ffb84a' : '#c9a6ff',
      0.9
    );
    G.Audio.sfx('rift');
    G.Spawner.say('Has entrado en la grieta…', 2.4, true);
  }

  const TOMB_POKEMON = [
    562, 563, 867, 769, 770, 710, 711, 623, 622, 302,
    355, 356, 429, 442, 477, 478, 592, 593, 708, 709, 778
  ];

  function spawnPharaohWave(n, spots) {
    if (!arena || !arena.pharaoh || !authority()) return;

    const t = G.Game.st.time;
    const party = G.Game.everyone().length;
    const ts = TS();

    let pool = TOMB_POKEMON
      .map(dex => G.DEX_BY[dex])
      .filter(mon => mon && G.SPRITE_META[mon.dex]);

    if (!pool.length) {
      pool = G.DEX.filter(
        mon => mon.types.includes('ghost') && G.SPRITE_META[mon.dex]
      );
    }

    if (!pool.length) {
      pool = G.DEX.filter(mon => G.SPRITE_META[mon.dex]);
    }

    for (let i = 0; i < n; i++) {
      const mon = G.U.pick(pool);
      const spot = spots[i % spots.length];
      const x = arena.x + spot[0] * ts;
      const y = arena.y + spot[1] * ts;
      const ghostly = mon.types.includes('ghost') || mon.types.includes('dark');

      const def = {
        dex: mon.dex,
        name: mon.name,
        hp: Math.round((250 + t * 3.4) * G.Coop.scaleHp(party)),
        spd: G.U.clamp(mon.spd * (ghostly ? 0.68 : 0.55), 34, 82),
        dmg: Math.round(48 + t / 15),
        xp: Math.round(90 + t),
        behavior: ghostly ? 'ranged' : 'charger',
        shotDmg: Math.round(27 + t / 35),
        shotCd: 1.1,
        range: 260
      };

      const e = new G.Enemy(def, x, y, { hp: 1, spd: 1, dmg: 1 });
      e.mummy = [562, 563, 867].includes(mon.dex);
      e.halloween = [710, 711, 778].includes(mon.dex);
      e.name = (e.mummy
        ? 'MOMIA '
        : e.halloween
          ? 'CALABAZA '
          : 'ESPECTRO ') + mon.name;

      G.EnemyMgr.add(e);
    }
  }

  function pharaohDungeonTick(dt) {
    if (arena.phase !== 'fight') {
      arena.endT -= dt;
      if (arena.endT <= 0) finish();
      return;
    }

    if (!authority()) return;

    const ts = TS();
    const party = G.Game.everyone().filter(p => !p.dead);
    const rooms = arena.rooms || [];

    const roomContains = (p, room) => {
      const x = (p.x - arena.x) / ts;
      const y = (p.y - arena.y) / ts;

      return x >= room.x - room.w &&
        x <= room.x + room.w &&
        y >= room.y - room.h &&
        y <= room.y + room.h;
    };

    /*
     * Cada sala intermedia se activa al entrar.
     * El último recinto activa el jefe después de que las salas anteriores
     * hayan sido visitadas.
     */
    for (let i = 1; i < rooms.length - 1; i++) {
      const room = rooms[i];

      if (room.triggered) continue;
      if (!party.some(p => roomContains(p, room))) continue;

      room.triggered = true;

      const spots = [];
      for (let j = 0; j < 8; j++) {
        const ox = G.U.rand(-room.w + 1, room.w - 1);
        const oy = G.U.rand(-room.h + 1, room.h - 1);
        spots.push([room.x + ox, room.y + oy]);
      }

      spawnPharaohWave(8 + Math.floor(Math.random() * 5), spots);
      G.Spawner.say(
        '¡Los guardianes despiertan en la cámara ' + i + '!',
        3.2,
        true
      );
    }

    const bossRoom = rooms[rooms.length - 1];

    if (bossRoom &&
        !arena.tomb.bossStarted &&
        rooms.slice(0, -1).every(room => room.triggered) &&
        party.some(p => roomContains(p, bossRoom))) {
      arena.tomb.bossStarted = true;
      spawnPharaohWave(18, [
        [-5, -48], [-2, -48], [2, -48], [5, -48],
        [-5, -51], [-2, -51], [2, -51], [5, -51],
        [-5, -54], [-2, -54], [2, -54], [5, -54]
      ]);
      spawnPharaohBoss();
    }

    if (arena.phase === 'fight' &&
        (arena.t > 600 || G.Game.everyone().every(p => p.dead))) {
      if (G.Coop.isHost) G.Coop.broadcast(['al']);
      lost();
      return;
    }

    if (arena.phase === 'fight' && arena.bossId) {
      keepInside();

      const boss = G.EnemyMgr.get(arena.bossId);

      if (!boss || boss.dead) {
        if (G.Coop.isHost) G.Coop.broadcast(['aw']);
        won();
      }
    }
  }

  function spawnPharaohBoss() {
    if (!arena || arena.bossId || !authority()) return;

    const mon = G.DEX_BY[arena.dex];
    const t = G.Game.st.time;
    const n = G.Game.everyone().length;
    const ts = TS();
    const rooms = arena.rooms || [];
    const room = rooms[rooms.length - 1] || { x: 0, y: -51 };

    const def = {
      dex: mon.dex,
      name: mon.name,
      hp: Math.round((12500 + t * 36) * G.Coop.scaleHp(n)),
      spd: 52,
      dmg: 105 + t / 12,
      xp: 5000,
      behavior: 'ranged',
      shotDmg: 62 + t / 30,
      shotCd: 0.72,
      range: 320
    };

    const e = new G.Enemy(
      def,
      arena.x + room.x * ts,
      arena.y + room.y * ts,
      { hp: 1, spd: 1, dmg: 1 },
      true
    );

    e.pharaoh = true;
    e.name = 'FARAÓN ' + mon.name;
    e.flying = false;

    G.EnemyMgr.add(e);
    arena.bossId = e.id;

    G.Spawner.say('¡El FARAÓN ' + mon.name + ' custodia la tumba!', 4, true);
    G.Camera.kick(1.5);
    G.Audio.sfx('boss');
  }

  // ---------------- arena glitcheada ----------------

  function spawnGlitchWave(n, spots) {
    if (!arena || !arena.glitch || !authority()) return;

    const t = G.Game.st.time;
    const players = G.Game.everyone().length;
    const ts = TS();

    const pool = G.DEX.filter(
      p => G.SPRITE_META[p.dex] &&
        !arena.dungeon.seenDex.includes(p.dex)
    );

    for (let i = 0; i < n; i++) {
      const mi = Math.floor(Math.random() * pool.length);
      const mon = pool.splice(mi, 1)[0];

      if (!mon) break;

      arena.dungeon.seenDex.push(mon.dex);

      const spot = spots[i % spots.length];
      const x = arena.x + spot[0] * ts;
      const y = arena.y + spot[1] * ts;

      const def = {
        dex: mon.dex,
        name: mon.name,
        hp: Math.round((90 + t * 2.1) * G.Coop.scaleHp(players)),
        spd: G.U.clamp(mon.spd * 0.72, 38, 92),
        dmg: 18 + t / 38,
        xp: 32 + t * 0.5,
        behavior: mon.types.some(x =>
          ['psychic', 'electric', 'ghost', 'fairy', 'fire',
           'water', 'ice', 'dragon'].includes(x)
        ) ? 'ranged' : 'charger',
        shotDmg: 12 + t / 80,
        shotCd: 1.3,
        range: 220
      };

      const e = new G.Enemy(def, x, y, { hp: 1, spd: 1, dmg: 1 });
      e.glitched = true;
      e.name = 'GLITCH ' + mon.name;
      G.EnemyMgr.add(e);
    }
  }

  function spawnLegend() {
    const mon = G.DEX_BY[arena.dex];
    const t = G.Game.st.time;
    const n = G.Game.everyone().length;
    const ts = TS();

    const def = {
      dex: mon.dex,
      name: mon.name,
      hp: Math.round(
        (3200 + t * 9) * G.Coop.scaleHp(n) * (n > 1 ? 1.4 : 1)
      ),
      spd: Math.round(G.U.clamp(48 + (mon.spd - 78) * 0.6, 48, 105)),
      dmg: Math.round(36 + t / 20),
      xp: Math.round(500 + t * 1.2),
      behavior: mon.types.some(x =>
        ['psychic', 'electric', 'ghost', 'fairy', 'fire',
         'water', 'ice', 'dragon'].includes(x)
      ) ? 'ranged' : 'charger',
      shotDmg: Math.round(18 + t / 40),
      shotCd: 0.9,
      range: 300
    };

    const e = new G.Enemy(
      def,
      arena.x,
      arena.y - ts * 3.5,
      { hp: 1, spd: 1, dmg: 1 },
      true
    );

    e.legend = true;
    e.flying = false;

    if (arena.shiny) e.makeShiny();

    G.EnemyMgr.add(e);
    arena.bossId = e.id;

    G.Spawner.say(
      '¡' + e.name + (e.shiny ? ' shiny' : '') +
      ' te esperaba en la grieta!',
      3.2
    );

    G.Camera.kick(1.1);
    G.Audio.sfx('boss');
  }

  function keepInside() {
    const ts = TS();
    const max = (arena.r - 1.4) * ts;

    for (const e of G.EnemyMgr.all()) {
      if (e.remote) continue;

      const dx = e.x - arena.x;
      const dy = e.y - arena.y;
      const d = Math.hypot(dx, dy);

      if (d > max) {
        e.x = arena.x + dx / d * max;
        e.y = arena.y + dy / d * max;
      }
    }
  }

  function arenaTick(dt, pl) {
    arena.t += dt;

    if (arena.pharaoh) {
      pharaohDungeonTick(dt);
      return;
    }

    if (arena.glitch) {
      dungeonTick(dt, pl);

      if (arena.phase === 'fight' &&
          (arena.t > 300 || G.Game.everyone().every(p => p.dead))) {
        if (G.Coop.isHost) G.Coop.broadcast(['al']);
        lost();
        return;
      }

      if (arena.phase === 'fight' && arena.bossId) {
        if (!authority()) return;

        keepInside();

        const boss = G.EnemyMgr.get(arena.bossId);

        if (!boss || boss.dead) {
          if (G.Coop.isHost) G.Coop.broadcast(['aw']);
          won();
          return;
        }

        if (arena.t > 300) {
          if (G.Coop.isHost) G.Coop.broadcast(['al']);
          lost();
        }
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

      if (!boss || boss.dead) {
        if (G.Coop.isHost) G.Coop.broadcast(['aw']);
        won();
        return;
      }

      const allDown = G.Game.everyone().every(p => p.dead);
      downT = allDown ? downT + dt : 0;

      if (downT > 1.4 || arena.t > ARENA_TIME) {
        if (G.Coop.isHost) G.Coop.broadcast(['al']);
        lost();
      }

      return;
    }

    arena.endT -= dt;
    if (arena.endT <= 0) finish();
  }

  // ---------------- puzles de la grieta glitcheada ----------------

  const GLYPHS = [[-10, -3], [-7, 0], [-10, 2]];
  const NODES = [[7, -3], [10, 0], [7, 2]];
  const SEQ_A = [0, 2, 1];
  const SEQ_B = [2, 0, 1];

  function dungeonTick(dt, pl) {
    if (!authority() || arena.phase !== 'fight') return;

    const ts = TS();
    const party = G.Game.everyone().filter(p => !p.dead);
    const d = arena.dungeon;
    const before = [d.a, d.b, d.stepA, d.stepB].join(',');

    if (!d.spawnedA && party.some(p =>
      (p.x - arena.x) / ts < -5 &&
      (p.y - arena.y) / ts > -6 &&
      (p.y - arena.y) / ts < 4
    )) {
      d.spawnedA = true;
      spawnGlitchWave(3, [[-11, -4], [-6, -4], [-11, 2]]);
    }

    if (!d.spawnedB && party.some(p =>
      (p.x - arena.x) / ts > 5 &&
      (p.y - arena.y) / ts > -6 &&
      (p.y - arena.y) / ts < 4
    )) {
      d.spawnedB = true;
      spawnGlitchWave(3, [[6, -4], [11, -4], [11, 2]]);
    }

    const pad = (points, progress, seq, lastKey) => {
      let found = -1;

      points.forEach((p, i) => {
        if (party.some(who =>
          G.U.dist2(
            who.x,
            who.y,
            arena.x + p[0] * ts,
            arena.y + p[1] * ts
          ) < 24 * 24
        )) {
          found = i;
        }
      });

      if (found < 0) {
        d[lastKey] = -1;
        return progress;
      }

      if (found === d[lastKey]) return progress;
      d[lastKey] = found;

      if (found === seq[progress]) {
        progress++;

        G.FX.ring(
          arena.x + points[found][0] * ts,
          arena.y + points[found][1] * ts,
          5, 52, '#42fff0', 0.5, 4
        );

        G.Audio.sfx('select');

        if (progress >= seq.length) return seq.length;
      } else {
        progress = found === seq[0] ? 1 : 0;
        G.Audio.sfx('back');
      }

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
        G.Spawner.say(
          '¡Los dos puzles están resueltos! La puerta del jefe se ha abierto',
          4,
          true
        );

        if (G.Coop.isHost) {
          G.Coop.broadcast([
            'rp',
            {
              a: d.a, b: d.b, stepA: d.stepA,
              stepB: d.stepB, open: d.open
            }
          ]);
        }

        spawnGlitchBoss();
      }
    } else if (G.Coop.isHost &&
               before !== [d.a, d.b, d.stepA, d.stepB].join(',')) {
      G.Coop.broadcast([
        'rp',
        {
          a: d.a, b: d.b, stepA: d.stepA,
          stepB: d.stepB, open: d.open
        }
      ]);
    }
  }

  function spawnGlitchBoss() {
    if (!arena || arena.bossId || !authority()) return;

    const mon = G.DEX_BY[arena.dex];
    const t = G.Game.st.time;
    const n = G.Game.everyone().length;

    const def = {
      dex: mon.dex,
      name: mon.name,
      hp: Math.round(
        (2800 + t * 8) * G.Coop.scaleHp(n) * (n > 1 ? 1.35 : 1)
      ),
      spd: 65,
      dmg: 32 + t / 24,
      xp: 850 + t,
      behavior: 'ranged',
      shotDmg: 20 + t / 45,
      shotCd: 0.8,
      range: 280
    };

    const ts = TS();
    const e = new G.Enemy(
      def,
      arena.x,
      arena.y - 21 * ts,
      { hp: 1, spd: 1, dmg: 1 },
      true
    );

    e.glitched = true;
    e.name = 'GLITCHED ' + mon.name;
    e.flying = false;

    G.EnemyMgr.add(e);
    arena.bossId = e.id;

    G.Spawner.say('¡' + e.name + ' custodia la última sala!', 3.6, true);
    G.Camera.kick(1);
    G.Audio.sfx('boss');
  }

  // ---------------- resultado y regreso ----------------

  function won() {
    if (!arena || arena.phase !== 'fight') return;

    arena.phase = 'won';
    arena.endT = 5;

    G.Progress.event('rift', { type: arena.type });
    G.Pickups.pullAll();

    G.Spawner.say(
      '¡Has vencido a ' + G.DEX_BY[arena.dex].name + '! Recoge el premio…',
      3.4,
      true
    );

    G.Audio.sfx('legend');

    const pl = G.Game.player;

    if (pl) {
      pl.bonds++;
      G.FX.dmgText(
        pl.x, pl.y - pl.bodyH - 10, '¡Vínculo!', '#ff8ad8', true
      );
      G.FX.ring(pl.x, pl.y, 8, 90, '#ff8ad8', 0.7, 5);
    }
  }

  function lost() {
    if (!arena || arena.phase !== 'fight') return;

    arena.phase = 'lost';
    arena.endT = 1.2;

    G.Spawner.say('La grieta os ha expulsado…', 2.6, true);
    G.Audio.sfx('back');
  }

  function finish() {
    const pl = G.Game.player;
    const a = arena;

    arena = null;

    G.World.setArena(null);
    G.World.setBiome(a.biome, true);
    G.Weather.clear();

    if (authority()) G.EnemyMgr.restore();

    G.Projectiles.clear();
    G.Combat.clearFields();
    G.Hazards.clear();

    for (const p of G.Game.everyone()) {
      p.x = a.back.x;
      p.y = a.back.y;
    }

    pl.x = a.back.x;
    pl.y = a.back.y;

    if (pl.dead) pl.revive(0.3);

    G.Camera.x = pl.x;
    G.Camera.y = pl.y;
    G.Game.flash('#c9a6ff', 0.8);

    if (pl.bonds > 0) G.Game.offerBond();
  }

  // ---------------- dibujo ----------------

  function drawable() {
    const out = [];

    if (rift) {
      out.push({
        y: rift.y,
        draw(ctx) {
          const P = G.Sprites.PX;
          const img = G.Tiles.propSprite(
            0, 'rift', Math.floor(rift.t * 8) % 4
          );
          const w = img.width * P;
          const h = img.height * P;
          const fadeIn = Math.min(1, rift.t * 2);
          const fadeOut = Math.min(1, rift.ttl / 1.5);

          ctx.save();
          ctx.globalAlpha = 0.25 * fadeIn * fadeOut;
          ctx.fillStyle = rift.kind === 'glitch'
            ? '#20cfc7'
            : rift.kind === 'abyss'
              ? '#e75b24'
              : '#7b3cff';

          ctx.beginPath();
          ctx.ellipse(rift.x, rift.y, 34, 12, 0, 0, 6.2832);
          ctx.fill();

          ctx.globalAlpha = fadeIn * fadeOut;
          ctx.save();

          if (rift.kind === 'glitch') {
            ctx.filter = 'hue-rotate(280deg) saturate(1.7)';
          } else if (rift.kind === 'abyss') {
            ctx.filter = 'sepia(1) saturate(2.4) hue-rotate(345deg)';
          }

          ctx.drawImage(
            img,
            Math.round(rift.x - w / 2),
            Math.round(rift.y - h + 4),
            w,
            h
          );

          ctx.restore();
          ctx.restore();

          if (Math.random() < 0.3) {
            G.FX.px(
              rift.x + G.U.rand(-14, 14),
              rift.y - G.U.rand(10, 80),
              rift.kind === 'glitch'
                ? '#42fff0'
                : rift.kind === 'abyss'
                  ? '#ffbf52'
                  : '#d9c2ff',
              { vy: -40, life: 0.6 }
            );
          }
        }
      });
    }

    if (arena && arena.glitch) {
      const ts = TS();
      const points = [
        ...GLYPHS.map((p, i) => ({ p, i })),
        ...NODES.map((p, i) => ({ p, i }))
      ];

      points.forEach((q, i) => out.push({
        y: arena.y + q.p[1] * ts,
        draw(ctx) {
          const x = arena.x + q.p[0] * ts;
          const y = arena.y + q.p[1] * ts;
          const on = i < 3
            ? !!arena.dungeon.a
            : !!arena.dungeon.b;

          const glyphs = ['◇', '△', '○'];

          ctx.save();
          ctx.globalAlpha = on ? 0.42 : 0.8;
          ctx.fillStyle = on
            ? '#65ffe8'
            : i < 3
              ? ['#ff56c8', '#ff9e58', '#d37cff'][q.i]
              : ['#4ce6ff', '#ffd853', '#ff6dd0'][q.i];

          ctx.beginPath();
          ctx.arc(x, y, 18 + Math.sin(performance.now() / 210 + i) * 2,
            0, 6.2832);
          ctx.fill();

          ctx.globalAlpha = 1;
          ctx.fillStyle = '#101a2b';
          ctx.font = 'bold 16px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(i < 3 ? glyphs[q.i] : '✦', x, y);
          ctx.restore();
        }
      }));

      out.push({
        y: arena.y - 18 * ts,
        draw(ctx) {
          const x = arena.x;
          const y = arena.y - 18 * ts;

          ctx.save();
          ctx.fillStyle = arena.dungeon.open ? '#42fff0' : '#ff4bc8';
          ctx.globalAlpha = 0.85;
          ctx.fillRect(x - 80, y - 5, 160, 10);
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.font = 'bold 11px sans-serif';
          ctx.fillText(
            arena.dungeon.open ? 'PUERTA ABIERTA' : 'PUERTA SELLADA',
            x,
            y - 18
          );
          ctx.restore();
        }
      });

      out.push({
        y: arena.y + 5 * ts,
        draw(ctx) {
          const x = arena.x;
          const y = arena.y + 5 * ts;

          ctx.save();
          ctx.fillStyle = '#d6fff9';
          ctx.textAlign = 'center';
          ctx.font = 'bold 12px sans-serif';
          ctx.fillText('RUNAS: ◇ → ○ → △', x, y);
          ctx.fillText('NODOS: ROSA → CIAN → ORO', x, y + 17);
          ctx.restore();
        }
      });
    }

    if (arena && arena.pharaoh) {
      const ts = TS();

      for (const room of arena.rooms || []) {
        const text = room.boss
          ? 'CÁMARA DEL FARAÓN'
          : room.id === 0
            ? 'ENTRADA DE LA TUMBA'
            : 'CÁMARA ' + room.id;

        out.push({
          y: arena.y + room.y * ts,
          draw(ctx) {
            ctx.save();
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.lineWidth = 4;
            ctx.strokeStyle = 'rgba(28,18,10,.9)';

            ctx.strokeText(
              G.T(text),
              arena.x + room.x * ts,
              arena.y + room.y * ts
            );

            ctx.fillStyle = '#ffd47a';
            ctx.fillText(
              G.T(text),
              arena.x + room.x * ts,
              arena.y + room.y * ts
            );

            ctx.restore();
          }
        });
      }
    }

    return out;
  }

  // ---------------- red ----------------

  function onEvent(ev) {
    switch (ev[0]) {
      case 'rift':
        show(ev[1], ev[2], ev[3], ev[4]);
        break;

      case 'riftx':
        rift = null;
        break;

      case 'arena':
        begin(ev[1]);
        break;

      case 'aw':
        won();
        break;

      case 'al':
        lost();
        break;

      case 'rp':
        if (arena && arena.dungeon) {
          Object.assign(arena.dungeon, ev[1]);
          G.World.setArena(G.World.arena);

          if (arena.dungeon.open && !arena.bossId) {
            spawnGlitchBoss();
          }
        }
        break;
    }
  }

  return {
    reset,
    update,
    drawable,
    onEvent,
    leftBehind,

    enterRequest() {
      if (!arena) start();
    },

    get rift() {
      return rift;
    },

    get arena() {
      return arena;
    },

    get inArena() {
      return !!arena;
    },

    get timeLeft() {
      return arena
        ? Math.max(
            0,
            (arena.pharaoh ? 600 : arena.glitch ? 300 : ARENA_TIME) - arena.t
          )
        : 0;
    },

    get xpMultiplier() {
      return arena && arena.pharaoh
        ? 0.28
        : arena && arena.glitch
          ? 0.45
          : 1;
    },

    debugOpen() {
      open();
    },

    adminOpen,

    debugArena(type) {
      start(type);
    },

    debugNextType(type) {
      nextType = type;
    }
  };
})();
```

/* ==========================================================================
   maze.js — Generador del Nivel 0: laberinto, salas con pilares,
   geometría combinada (1 draw call por material), colisiones con
   deslizamiento, paneles fluorescentes y luces con parpadeo.
   ========================================================================== */
(function () {
  'use strict';
  var THREE = AFRAME.THREE;

  var N = 18;          // celdas por lado (>= 16)
  var CELL = 3;        // metros por celda
  var T = 0.2;         // grosor de pared
  var LIGHT_POOL = 4;  // luces dinámicas que siguen a las lámparas cercanas

  // Direcciones: 0 = +x (este), 1 = -x (oeste), 2 = +z (sur), 3 = -z (norte)
  var DX = [1, -1, 0, 0], DZ = [0, 0, 1, -1];

  function build(root, opts) {
    opts = opts || {};
    var seed = opts.seed || (Math.random() * 1e9) | 0;
    var r = BRTextures.rng(seed);
    var theme = opts.theme === 'pools' ? 'pools' : 'level0';
    // Configuración de cada nivel.
    var CFG = theme === 'pools' ? {
      H: 4.2, extraOpen: 0.32, rooms: 8, roomMin: 3, roomMax: 5, pillarProb: 0.9, faulty: 2,
      lightColor: 0xf2f8ff, lightPower: 0.85
    } : {
      H: 3.2, extraOpen: 0.09, rooms: 5, roomMin: 3, roomMax: 4, pillarProb: 0.8, faulty: 14,
      lightColor: 0xfff0c0, lightPower: 1.5
    };
    var H = CFG.H;
    var M = { N: N, CELL: CELL, H: H, seed: seed, theme: theme };

    /* ------------------------------------------------------------------
       1) Laberinto: backtracker recursivo (pasillos y callejones sin salida)
       hW[z][x]: pared horizontal en el borde norte de la fila z (z = 0..N)
       vW[z][x]: pared vertical en el borde oeste de la columna x (x = 0..N)
       ------------------------------------------------------------------ */
    var hW = [], vW = [], z, x;
    for (z = 0; z <= N; z++) { hW.push([]); for (x = 0; x < N; x++) hW[z].push(true); }
    for (z = 0; z < N; z++) { vW.push([]); for (x = 0; x <= N; x++) vW[z].push(true); }

    function canMove(cx, cz, d) {
      if (d === 0) return cx < N - 1 && !vW[cz][cx + 1];
      if (d === 1) return cx > 0 && !vW[cz][cx];
      if (d === 2) return cz < N - 1 && !hW[cz + 1][cx];
      return cz > 0 && !hW[cz][cx];
    }
    function openWall(cx, cz, d) {
      if (d === 0) vW[cz][cx + 1] = false;
      else if (d === 1) vW[cz][cx] = false;
      else if (d === 2) hW[cz + 1][cx] = false;
      else hW[cz][cx] = false;
    }

    var visited = new Uint8Array(N * N);
    var stack = [[0, 0]];
    visited[0] = 1;
    while (stack.length) {
      var cur = stack[stack.length - 1];
      var opts2 = [];
      for (var d = 0; d < 4; d++) {
        var nx = cur[0] + DX[d], nz = cur[1] + DZ[d];
        if (nx >= 0 && nz >= 0 && nx < N && nz < N && !visited[nz * N + nx]) opts2.push(d);
      }
      if (!opts2.length) { stack.pop(); continue; }
      var dd = opts2[Math.floor(r() * opts2.length)];
      openWall(cur[0], cur[1], dd);
      var nc = [cur[0] + DX[dd], cur[1] + DZ[dd]];
      visited[nc[1] * N + nc[0]] = 1;
      stack.push(nc);
    }

    // Algunos bucles extra para que no sea un árbol perfecto (sigue habiendo callejones).
    for (z = 1; z < N; z++) for (x = 0; x < N; x++) if (hW[z][x] && r() < CFG.extraOpen) hW[z][x] = false;
    for (z = 0; z < N; z++) for (x = 1; x < N; x++) if (vW[z][x] && r() < CFG.extraOpen) vW[z][x] = false;

    /* ------------------------------------------------------------------
       2) Salas abiertas con pilares
       ------------------------------------------------------------------ */
    var pillars = [];
    var rooms = [];
    var tries = 0;
    while (rooms.length < CFG.rooms && tries++ < 300) {
      var span = CFG.roomMax - CFG.roomMin + 1;
      var rw = CFG.roomMin + Math.floor(r() * span), rh = CFG.roomMin + Math.floor(r() * span);
      var rx = 1 + Math.floor(r() * (N - rw - 2)), rz = 1 + Math.floor(r() * (N - rh - 2));
      // Lejos del inicio y de la salida.
      if (rx < 4 && rz < 4) continue;
      if (rx + rw > N - 4 && rz + rh > N - 4) continue;
      var overlap = rooms.some(function (o) {
        return rx < o.x + o.w + 1 && rx + rw + 1 > o.x && rz < o.z + o.h + 1 && rz + rh + 1 > o.z;
      });
      if (overlap) continue;
      rooms.push({ x: rx, z: rz, w: rw, h: rh });
    }
    rooms.forEach(function (o) {
      for (var zz = o.z; zz < o.z + o.h; zz++) {
        for (var xx = o.x; xx < o.x + o.w; xx++) {
          if (xx > o.x) vW[zz][xx] = false;
          if (zz > o.z) hW[zz][xx] = false;
        }
      }
      for (var pz = o.z + 1; pz < o.z + o.h; pz++) {
        for (var px = o.x + 1; px < o.x + o.w; px++) {
          if (r() < CFG.pillarProb) pillars.push([px * CELL, pz * CELL]);
        }
      }
    });
    M.rooms = rooms;

    /* ------------------------------------------------------------------
       3) Colisionadores (segmentos colineales combinados)
       ------------------------------------------------------------------ */
    var boxes = [];
    for (z = 0; z <= N; z++) {
      x = 0;
      while (x < N) {
        if (!hW[z][x]) { x++; continue; }
        var x0 = x;
        while (x < N && hW[z][x]) x++;
        boxes.push({ minX: x0 * CELL - T / 2, maxX: x * CELL + T / 2, minZ: z * CELL - T / 2, maxZ: z * CELL + T / 2 });
      }
    }
    for (x = 0; x <= N; x++) {
      z = 0;
      while (z < N) {
        if (!vW[z][x]) { z++; continue; }
        var z0 = z;
        while (z < N && vW[z][x]) z++;
        boxes.push({ minX: x * CELL - T / 2, maxX: x * CELL + T / 2, minZ: z0 * CELL - T / 2, maxZ: z * CELL + T / 2 });
      }
    }
    pillars.forEach(function (p) {
      boxes.push({ minX: p[0] - 0.3, maxX: p[0] + 0.3, minZ: p[1] - 0.3, maxZ: p[1] + 0.3, pillar: true });
    });

    // Índice espacial por celda.
    var cellCols = [];
    for (var i = 0; i < N * N; i++) cellCols.push([]);
    boxes.forEach(function (b, bi) {
      var c0x = Math.max(0, Math.floor((b.minX - 0.6) / CELL)), c1x = Math.min(N - 1, Math.floor((b.maxX + 0.6) / CELL));
      var c0z = Math.max(0, Math.floor((b.minZ - 0.6) / CELL)), c1z = Math.min(N - 1, Math.floor((b.maxZ + 0.6) / CELL));
      for (var cz = c0z; cz <= c1z; cz++) for (var cx = c0x; cx <= c1x; cx++) cellCols[cz * N + cx].push(bi);
    });

    /* Colisión círculo vs AABB con empuje por la normal => deslizamiento suave
       a lo largo de las paredes, sin atravesarlas ni quedar atascado. */
    function resolve(pos, rad) {
      var cx = Math.min(N - 1, Math.max(0, Math.floor(pos.x / CELL)));
      var cz = Math.min(N - 1, Math.max(0, Math.floor(pos.z / CELL)));
      var list = cellCols[cz * N + cx];
      for (var it = 0; it < 3; it++) {
        var moved = false;
        for (var k = 0; k < list.length; k++) {
          var b = boxes[list[k]];
          var px = Math.max(b.minX, Math.min(pos.x, b.maxX));
          var pz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
          var dx = pos.x - px, dz = pos.z - pz;
          var d2 = dx * dx + dz * dz;
          if (d2 >= rad * rad) continue;
          if (d2 > 1e-8) {
            var dist = Math.sqrt(d2), push = (rad - dist) + 0.0005;
            pos.x += dx / dist * push; pos.z += dz / dist * push;
          } else {
            // Centro dentro de la caja: sacar por el eje de menor penetración.
            var l = pos.x - b.minX, rr = b.maxX - pos.x, t = pos.z - b.minZ, bt = b.maxZ - pos.z;
            var m = Math.min(l, rr, t, bt);
            if (m === l) pos.x = b.minX - rad; else if (m === rr) pos.x = b.maxX + rad;
            else if (m === t) pos.z = b.minZ - rad; else pos.z = b.maxZ + rad;
          }
          moved = true;
        }
        if (!moved) break;
      }
      // Límite absoluto del mapa (red de seguridad).
      pos.x = Math.max(T / 2 + rad, Math.min(N * CELL - T / 2 - rad, pos.x));
      pos.z = Math.max(T / 2 + rad, Math.min(N * CELL - T / 2 - rad, pos.z));
      return pos;
    }

    /* ------------------------------------------------------------------
       4) Geometría combinada de paredes y pilares
       ------------------------------------------------------------------ */
    var P = [], NR = [], UV = [], IDX = [];
    var UW = 1.6; // metros por repetición horizontal del papel tapiz
    function quad(a, b, c, d, n, ua, ub) {
      var base = P.length / 3;
      P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
      for (var q = 0; q < 4; q++) NR.push(n[0], n[1], n[2]);
      UV.push(ua, a[1] / H, ub, b[1] / H, ub, c[1] / H, ua, d[1] / H);
      IDX.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    function addBox(b) {
      var x0 = b.minX, x1 = b.maxX, z0 = b.minZ, z1 = b.maxZ;
      quad([x0, 0, z1], [x1, 0, z1], [x1, H, z1], [x0, H, z1], [0, 0, 1], x0 / UW, x1 / UW);       // +z
      quad([x1, 0, z0], [x0, 0, z0], [x0, H, z0], [x1, H, z0], [0, 0, -1], -x1 / UW, -x0 / UW);    // -z
      quad([x1, 0, z1], [x1, 0, z0], [x1, H, z0], [x1, H, z1], [1, 0, 0], -z1 / UW, -z0 / UW);     // +x
      quad([x0, 0, z0], [x0, 0, z1], [x0, H, z1], [x0, H, z0], [-1, 0, 0], z0 / UW, z1 / UW);      // -x
    }
    boxes.forEach(addBox);
    var wallGeo = new THREE.BufferGeometry();
    wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    wallGeo.setAttribute('normal', new THREE.Float32BufferAttribute(NR, 3));
    wallGeo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    wallGeo.setIndex(IDX);
    wallGeo.computeBoundingSphere();

    var wallTex;
    if (theme === 'pools') { wallTex = BRTextures.poolWall(); wallTex.repeat.set(1, H / 1.6); }
    else wallTex = BRTextures.wallpaper();
    var wallMat = new THREE.MeshLambertMaterial({ map: wallTex });
    var walls = new THREE.Mesh(wallGeo, wallMat);
    walls.matrixAutoUpdate = false;
    root.add(walls);

    var W = N * CELL;
    var carpetTex = theme === 'pools' ? BRTextures.poolFloor() : BRTextures.carpet();
    carpetTex.repeat.set(W / 2, W / 2);
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(W, W), new THREE.MeshLambertMaterial({ map: carpetTex }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(W / 2, 0, W / 2);
    root.add(floor);

    var ceilTex = theme === 'pools' ? BRTextures.poolCeiling() : BRTextures.ceiling();
    ceilTex.repeat.set(W / 1.2, W / 1.2);
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, W), new THREE.MeshLambertMaterial({ map: ceilTex }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(W / 2, H, W / 2);
    root.add(ceil);

    /* ------------------------------------------------------------------
       5b) Piscinas (sólo en el nivel de las Piscinas)
       ------------------------------------------------------------------ */
    var pools = [];
    M.waterTex = null;
    if (theme === 'pools') {
      rooms.forEach(function (o) {
        if (r() < 0.85) pools.push({ minX: o.x * CELL + 0.5, maxX: (o.x + o.w) * CELL - 0.5, minZ: o.z * CELL + 0.5, maxZ: (o.z + o.h) * CELL - 0.5 });
      });
      for (var pc = 0; pc < 8; pc++) {
        var px0 = 2 + Math.floor(r() * (N - 5)), pz0 = 2 + Math.floor(r() * (N - 5));
        if (px0 > N - 5 && pz0 > N - 5) continue;
        var horiz = r() < 0.5;
        pools.push({ minX: px0 * CELL + 0.35, maxX: (px0 + (horiz ? 2 : 1)) * CELL - 0.35, minZ: pz0 * CELL + 0.35, maxZ: (pz0 + (horiz ? 1 : 2)) * CELL - 0.35 });
      }
      var bottomTex = BRTextures.poolBottom();
      var waterTex = BRTextures.caustics();
      M.waterTex = waterTex;
      var bottomMat = new THREE.MeshLambertMaterial({ map: bottomTex });
      var waterMat = new THREE.MeshLambertMaterial({ color: 0xbff4ff, map: waterTex, transparent: true, opacity: 0.55, depthWrite: false });
      pools.forEach(function (pl) {
        var w = pl.maxX - pl.minX, d = pl.maxZ - pl.minZ;
        var bt = bottomTex.clone(); bt.needsUpdate = true; bt.repeat.set(w / 1.6, d / 1.6);
        var bottom = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map: bt }));
        bottom.rotation.x = -Math.PI / 2;
        bottom.position.set((pl.minX + pl.maxX) / 2, 0.004, (pl.minZ + pl.maxZ) / 2);
        root.add(bottom);
        var wgeo = new THREE.PlaneGeometry(w, d);
        var uv = wgeo.attributes.uv;
        for (var ui = 0; ui < uv.count; ui++) uv.setXY(ui, uv.getX(ui) * w / 3, uv.getY(ui) * d / 3);
        var water = new THREE.Mesh(wgeo, waterMat);
        water.rotation.x = -Math.PI / 2;
        water.position.set((pl.minX + pl.maxX) / 2, 0.3, (pl.minZ + pl.maxZ) / 2);
        water.renderOrder = 2;
        root.add(water);
      });
      bottomMat.dispose();
    }
    M.pools = pools;
    M.isWater = function (x, z) {
      for (var i = 0; i < pools.length; i++) {
        var pl = pools[i];
        if (x > pl.minX && x < pl.maxX && z > pl.minZ && z < pl.maxZ) return true;
      }
      return false;
    };

    /* ------------------------------------------------------------------
       5) Paneles fluorescentes (InstancedMesh: 1 draw call) + luces
       ------------------------------------------------------------------ */
    var fixtures = [];
    for (z = 0; z < N; z++) for (x = 0; x < N; x++) {
      fixtures.push({
        x: x * CELL + CELL / 2, z: z * CELL + CELL / 2, cx: x, cz: z,
        faulty: false, on: true, bright: 1, shown: -1, timer: r() * 3, burst: 0
      });
    }
    // Lámparas defectuosas: 2 junto al inicio (para notarlas pronto) + varias al azar.
    function fx(cx, cz) { return fixtures[cz * N + cx]; }
    if (theme === 'level0') { fx(1, 0).faulty = true; fx(0, 2).faulty = true; fx(2, 1).faulty = true; }
    for (var f = 0; f < CFG.faulty; f++) fixtures[Math.floor(r() * fixtures.length)].faulty = true;

    var panelGeo = new THREE.PlaneGeometry(1.2, 0.6);
    panelGeo.rotateX(Math.PI / 2); // mirando hacia abajo
    var panelMat = new THREE.MeshBasicMaterial({ map: BRTextures.lightPanel(), toneMapped: false });
    var panels = new THREE.InstancedMesh(panelGeo, panelMat, fixtures.length);
    var tmpM = new THREE.Matrix4(), tmpC = new THREE.Color();
    fixtures.forEach(function (fi, k) {
      tmpM.makeTranslation(fi.x, H - 0.01, fi.z);
      panels.setMatrixAt(k, tmpM);
      panels.setColorAt(k, tmpC.setRGB(1, 1, 1));
    });
    panels.instanceMatrix.needsUpdate = true;
    root.add(panels);

    var lights = [];
    for (var li = 0; li < LIGHT_POOL; li++) {
      var pl = new THREE.PointLight(CFG.lightColor, 0, 10, 1.6);
      pl.position.set(-100, H - 0.3, -100);
      pl.userData = { fixture: null, fade: 0 };
      root.add(pl);
      lights.push(pl);
    }

    /* ------------------------------------------------------------------
       6) Puerta de salida con letrero EXIT verde (extremo opuesto al inicio)
       ------------------------------------------------------------------ */
    var exitCell = { cx: N - 1, cz: N - 1 };
    var exitX = N * CELL - T / 2 - 0.02, exitZ = exitCell.cz * CELL + CELL / 2;
    var exitGroup = new THREE.Group();
    var door = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.15), new THREE.MeshLambertMaterial({ map: BRTextures.door() }));
    door.rotation.y = -Math.PI / 2;
    door.position.set(exitX - 0.04, 1.075, exitZ);
    exitGroup.add(door);
    var frame = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.3, 1.3), new THREE.MeshLambertMaterial({ color: 0x3a3428 }));
    frame.position.set(exitX + 0.02, 1.15, exitZ);
    exitGroup.add(frame);
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.35), new THREE.MeshBasicMaterial({ map: BRTextures.exitSign(), toneMapped: false, fog: false }));
    sign.rotation.y = -Math.PI / 2;
    sign.position.set(exitX - 0.05, 2.55, exitZ);
    exitGroup.add(sign);
    var exitLight = new THREE.PointLight(0x40ff70, 2.5, 6, 1.5);
    exitLight.position.set(exitX - 0.6, 2.4, exitZ);
    exitGroup.add(exitLight);
    root.add(exitGroup);
    M.exit = { x: exitX - 0.3, z: exitZ, cell: exitCell };

    /* ------------------------------------------------------------------
       Utilidades de navegación (usadas por la entidad)
       ------------------------------------------------------------------ */
    function cellOf(px, pz) {
      return { cx: Math.min(N - 1, Math.max(0, Math.floor(px / CELL))), cz: Math.min(N - 1, Math.max(0, Math.floor(pz / CELL))) };
    }
    function center(cx, cz) { return { x: cx * CELL + CELL / 2, z: cz * CELL + CELL / 2 }; }

    // BFS completo desde una celda: devuelve distancias y predecesores.
    function bfs(sx, sz) {
      var dist = new Int16Array(N * N).fill(-1), prev = new Int16Array(N * N).fill(-1);
      var q = [sz * N + sx]; dist[q[0]] = 0;
      for (var h = 0; h < q.length; h++) {
        var id = q[h], cx = id % N, cz = (id / N) | 0;
        for (var d = 0; d < 4; d++) {
          if (!canMove(cx, cz, d)) continue;
          var nid = (cz + DZ[d]) * N + cx + DX[d];
          if (dist[nid] >= 0) continue;
          dist[nid] = dist[id] + 1; prev[nid] = id; q.push(nid);
        }
      }
      return { dist: dist, prev: prev };
    }
    function path(fromCx, fromCz, toCx, toCz) {
      var res = bfs(toCx, toCz); // BFS desde el destino => reconstrucción directa
      var out = [], id = fromCz * N + fromCx;
      if (res.dist[id] < 0) return out;
      while (id !== -1) { out.push({ cx: id % N, cz: (id / N) | 0 }); id = res.prev[id]; }
      return out; // incluye origen y destino
    }
    // Línea de visión simple: misma fila/columna sin paredes entre medio.
    function lineOfSight(a, b) {
      var s, e, i2;
      if (a.cz === b.cz) {
        s = Math.min(a.cx, b.cx); e = Math.max(a.cx, b.cx);
        for (i2 = s; i2 < e; i2++) if (!canMove(i2, a.cz, 0)) return false;
        return true;
      }
      if (a.cx === b.cx) {
        s = Math.min(a.cz, b.cz); e = Math.max(a.cz, b.cz);
        for (i2 = s; i2 < e; i2++) if (!canMove(a.cx, i2, 2)) return false;
        return true;
      }
      return false;
    }

    // Orientación inicial: mirar hacia el pasillo abierto.
    M.startCell = { cx: 0, cz: 0 };
    M.start = center(0, 0);
    M.startYaw = canMove(0, 0, 0) ? -90 : 180;

    /* ------------------------------------------------------------------
       7) Actualización de luces: parpadeo + pool de luces dinámicas
       ------------------------------------------------------------------ */
    var assignTimer = 0, zapCooldown = 0, colorDirty = false;
    function update(dt, player, entity) {
      zapCooldown -= dt;
      if (M.waterTex) { M.waterTex.offset.x += dt * 0.018; M.waterTex.offset.y += dt * 0.011; }
      for (var k = 0; k < fixtures.length; k++) {
        var fi = fixtures[k];
        var threat = 0;
        if (entity) {
          var ex = fi.x - entity.x, ez = fi.z - entity.z;
          var ed = Math.sqrt(ex * ex + ez * ez);
          if (ed < 10) threat = 1 - ed / 10;
        }
        if (fi.faulty || threat > 0) {
          fi.timer -= dt;
          if (fi.timer <= 0) {
            if (fi.on) {
              fi.on = false;
              fi.timer = 0.03 + r() * (threat > 0.3 ? 0.08 : 0.16);
            } else {
              fi.on = true;
              if (fi.burst > 0) { fi.burst--; fi.timer = 0.03 + r() * 0.15; }
              else { fi.burst = 1 + Math.floor(r() * 5); fi.timer = (fi.faulty ? 1 + r() * 5 : 2 + r() * 4); }
              if (threat > 0) fi.timer *= (1 - threat * 0.92);
              // Chispazo sincronizado al volver a encenderse.
              if (player && zapCooldown <= 0) {
                var pdx = fi.x - player.x, pdz = fi.z - player.z;
                var pd = Math.sqrt(pdx * pdx + pdz * pdz);
                if (pd < 13 && window.BRAudio) {
                  BRAudio.zap({ x: fi.x, y: H - 0.1, z: fi.z }, 0.5 * (1 - pd / 13) + 0.05);
                  zapCooldown = 0.07;
                }
              }
            }
          }
          fi.bright = fi.on ? 1 : 0.06 + r() * 0.1;
        } else if (!fi.on || fi.bright !== 1) {
          fi.on = true; fi.bright = 1;
        }
        if (fi.bright !== fi.shown) {
          fi.shown = fi.bright;
          var b = 0.25 + fi.bright * 0.75;
          panels.setColorAt(k, tmpC.setRGB(b, b, b * 0.95));
          colorDirty = true;
        }
      }
      if (colorDirty) { panels.instanceColor.needsUpdate = true; colorDirty = false; }

      if (!player) return;
      // Reasignar el pool de luces a las lámparas más cercanas (priorizando defectuosas).
      assignTimer -= dt;
      if (assignTimer <= 0) {
        assignTimer = 0.25;
        var pc = cellOf(player.x, player.z), cand = [];
        for (var cz = pc.cz - 2; cz <= pc.cz + 2; cz++) for (var cx = pc.cx - 2; cx <= pc.cx + 2; cx++) {
          if (cx < 0 || cz < 0 || cx >= N || cz >= N) continue;
          var fo = fx(cx, cz), ddx = fo.x - player.x, ddz = fo.z - player.z;
          cand.push({ f: fo, s: Math.sqrt(ddx * ddx + ddz * ddz) - (fo.faulty ? 1.5 : 0) });
        }
        cand.sort(function (a, b) { return a.s - b.s; });
        var chosen = cand.slice(0, LIGHT_POOL).map(function (c) { return c.f; });
        var free = [];
        lights.forEach(function (l) {
          var idx = chosen.indexOf(l.userData.fixture);
          if (idx >= 0) chosen.splice(idx, 1); else free.push(l);
        });
        free.forEach(function (l, j) {
          var nf = chosen[j];
          if (!nf) return;
          l.userData.fixture = nf; l.userData.fade = 0;
          l.position.set(nf.x, H - 0.35, nf.z);
        });
      }
      var sum = 0;
      lights.forEach(function (l) {
        var fo = l.userData.fixture;
        if (!fo) return;
        l.userData.fade = Math.min(1, l.userData.fade + dt * 3);
        l.intensity = CFG.lightPower * fo.bright * l.userData.fade;
        sum += fo.bright;
      });
      if (window.BRAudio) BRAudio.setHumLevel(0.55 + 0.45 * (sum / LIGHT_POOL));
    }

    M.resolve = resolve;
    M.canMove = canMove;
    M.cellOf = cellOf;
    M.center = center;
    M.bfs = bfs;
    M.path = path;
    M.lineOfSight = lineOfSight;
    M.update = update;
    M.fixtures = fixtures;
    M.boxes = boxes;
    return M;
  }

  window.BRMaze = { build: build };
})();
